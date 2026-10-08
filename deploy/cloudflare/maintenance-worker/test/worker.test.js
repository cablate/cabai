import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOriginRequest,
  explicitlyAcceptsHtml,
  handleRequest,
  isHtmlDocumentRequest,
  renderMaintenancePage,
  resolveConfig,
} from "../src/worker.js";
import worker from "../src/worker.js";

const ENV = {
  ORIGIN_BASE_URL: "https://cabai-origin.example",
  ORIGIN_TIMEOUT_MS: "1000",
  RETRY_AFTER_SECONDS: "60",
};

function request(path = "/products/demo-course", init = {}) {
  return new Request(`https://cabai.example${path}`, {
    headers: { accept: "text/html,application/xhtml+xml", ...init.headers },
    ...init,
  });
}

function fetchReturning(response) {
  return async () => response;
}

test("normal origin responses are returned by identity without header or body rewriting", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("streamed body"));
      controller.close();
    },
  });
  const originResponse = new Response(stream, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=30",
      "Content-Security-Policy": "default-src 'self'",
      "Set-Cookie": "session=opaque; Secure; HttpOnly",
    },
  });

  const response = await handleRequest(request(), ENV, { fetch: fetchReturning(originResponse) });

  assert.strictEqual(response, originResponse);
  assert.equal(response.headers.get("cache-control"), "public, max-age=30");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'self'");
  assert.match(response.headers.get("set-cookie"), /session=opaque/);
  assert.equal(await response.text(), "streamed body");
});

test("origin request uses the independent hostname and preserves path, query, method, headers, and body", async () => {
  const incoming = request("/api/callback?source=test", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "x-test": "kept" },
    body: JSON.stringify({ event: "completed" }),
  });
  const originRequest = buildOriginRequest(incoming, new URL(ENV.ORIGIN_BASE_URL));

  assert.equal(originRequest.url, "https://cabai-origin.example/api/callback?source=test");
  assert.equal(originRequest.method, "POST");
  assert.equal(originRequest.headers.get("x-test"), "kept");
  assert.equal(originRequest.headers.get("x-forwarded-host"), "cabai.example");
  assert.equal(originRequest.headers.get("x-forwarded-proto"), "https");
  assert.equal(originRequest.headers.get("x-cabai-edge-hop"), "maintenance-worker");
  assert.deepEqual(await originRequest.json(), { event: "completed" });
});

for (const status of [500, 502, 503, 504]) {
  test(`HTML navigation receives a branded 503 when origin returns ${status}`, async () => {
    const response = await handleRequest(request(), ENV, {
      fetch: fetchReturning(new Response(`origin ${status}`, { status })),
    });

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-cabai-fallback"), "maintenance");
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(await response.text(), /CabAI 暫時連不上/);
  });
}

test("an unapproved origin 5xx is passed through unchanged", async () => {
  const originResponse = new Response("not implemented", { status: 501 });
  const response = await handleRequest(request(), ENV, { fetch: fetchReturning(originResponse) });

  assert.strictEqual(response, originResponse);
  assert.equal(response.status, 501);
});

test("Cloudflare transport 530 becomes branded HTML 503 instead of leaking provider HTML", async () => {
  const response = await handleRequest(request(), ENV, {
    fetch: fetchReturning(new Response("cloudflare origin error", {
      status: 530,
      headers: { "content-type": "text/html" },
    })),
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-cabai-fallback"), "maintenance");
  assert.match(await response.text(), /CabAI 暫時連不上/);
});

test("Cloudflare transport 530 becomes stable JSON 503 for APIs", async () => {
  const response = await handleRequest(
    request("/api/health", { headers: { accept: "application/json" } }),
    ENV,
    {
      fetch: fetchReturning(new Response("cloudflare origin error", {
        status: 530,
        headers: { "content-type": "text/html" },
      })),
    },
  );

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.equal(response.headers.get("x-cabai-fallback"), null);
  assert.deepEqual(await response.json(), {
    error: "服務暫時無法使用，請稍後再試。",
    code: "ORIGIN_UNAVAILABLE",
    requestId: response.headers.get("x-request-id"),
  });
});

test("HEAD HTML navigation gets maintenance headers and no response body", async () => {
  const response = await handleRequest(request("/courses/demo", { method: "HEAD" }), ENV, {
    fetch: fetchReturning(new Response(null, { status: 503 })),
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-cabai-fallback"), "maintenance");
  assert.equal(await response.text(), "");
});

for (const path of [
  "/api/health",
  "/api/agent/openapi.yaml",
  "/api/cron/process-webhooks",
  "/api/callback",
  "/api/agent/webhooks",
  "/_next/static/app.js",
  "/images/cover.png",
]) {
  test(`${path} never receives maintenance HTML for an origin 503`, async () => {
    const originResponse = new Response("origin unavailable", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });
    const response = await handleRequest(request(path), ENV, { fetch: fetchReturning(originResponse) });

    assert.strictEqual(response, originResponse);
    assert.equal(response.headers.get("x-cabai-fallback"), null);
    assert.equal(await response.text(), "origin unavailable");
  });
}

test("POST callback preserves the origin failure and is never retried or converted to HTML", async () => {
  let calls = 0;
  const originResponse = new Response('{"error":"unavailable"}', {
    status: 502,
    headers: { "content-type": "application/json" },
  });
  const response = await handleRequest(
    request("/api/callback", {
      method: "POST",
      headers: { accept: "text/html", "content-type": "application/json" },
      body: "{}",
    }),
    ENV,
    {
      fetch: async () => {
        calls += 1;
        return originResponse;
      },
    },
  );

  assert.equal(calls, 1);
  assert.strictEqual(response, originResponse);
  assert.equal(response.status, 502);
  assert.match(response.headers.get("content-type"), /^application\/json/);
});

test("API network failure becomes stable JSON 503 rather than HTML or 200", async () => {
  const response = await handleRequest(
    request("/api/agent/readiness", {
      headers: { accept: "application/json", "x-request-id": "edge-request-1" },
    }),
    ENV,
    { fetch: async () => Promise.reject(new Error("simulated network failure")) },
  );

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.equal(response.headers.get("x-cabai-fallback"), null);
  assert.equal(response.headers.get("x-request-id"), "edge-request-1");
  assert.deepEqual(await response.json(), {
    error: "服務暫時無法使用，請稍後再試。",
    code: "ORIGIN_UNAVAILABLE",
    requestId: "edge-request-1",
  });
});

test("API network failure replaces an unsafe request ID", async () => {
  const response = await handleRequest(
    request("/api/agent/readiness", {
      headers: { accept: "application/json", "x-request-id": "unsafe request id with spaces" },
    }),
    ENV,
    { fetch: async () => Promise.reject(new Error("simulated network failure")) },
  );

  const body = await response.json();
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.equal(body.requestId, response.headers.get("x-request-id"));
});

test("HTML network failure becomes maintenance 503", async () => {
  const response = await handleRequest(request(), ENV, {
    fetch: async () => Promise.reject(new Error("simulated network failure")),
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-cabai-fallback"), "maintenance");
  assert.match(await response.text(), /我們正在處理/);
});

test("origin timeout is bounded and becomes maintenance 503", async () => {
  const response = await handleRequest(
    request(),
    { ...ENV, ORIGIN_TIMEOUT_MS: "250" },
    {
      fetch: (_request, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-cabai-fallback"), "maintenance");
});

test("missing or recursive origin config fails closed without making an origin request", async () => {
  for (const [env, incoming] of [
    [{}, request()],
    [{ ORIGIN_BASE_URL: "https://cabai.example" }, request()],
    [ENV, request("/", { headers: { accept: "text/html", "x-cabai-edge-hop": "maintenance-worker" } })],
  ]) {
    let calls = 0;
    const response = await handleRequest(incoming, env, {
      fetch: async () => {
        calls += 1;
        return new Response("unexpected");
      },
    });

    assert.equal(calls, 0);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-cabai-fallback"), "maintenance");
  }
});

test("fallback renderer failure returns the original response without a second origin request", async () => {
  let calls = 0;
  const originResponse = new Response("origin error", { status: 500 });
  const response = await handleRequest(request(), ENV, {
    fetch: async () => {
      calls += 1;
      return originResponse;
    },
    renderMaintenance: () => {
      throw new Error("simulated renderer error");
    },
  });

  assert.equal(calls, 1);
  assert.strictEqual(response, originResponse);
});

test("Accept parsing requires explicit text/html with positive quality", () => {
  assert.equal(explicitlyAcceptsHtml("text/html,application/xhtml+xml"), true);
  assert.equal(explicitlyAcceptsHtml("application/json,text/html;q=0.4"), true);
  assert.equal(explicitlyAcceptsHtml("text/html;q=0,application/json"), false);
  assert.equal(explicitlyAcceptsHtml("text/html; q = 0,application/json"), false);
  assert.equal(explicitlyAcceptsHtml("*/*"), false);
  assert.equal(explicitlyAcceptsHtml(null), false);
});

test("only safe document methods and paths qualify for HTML fallback", () => {
  assert.equal(isHtmlDocumentRequest(request("/products/demo")), true);
  assert.equal(isHtmlDocumentRequest(request("/products/demo", { method: "HEAD" })), true);
  assert.equal(
    isHtmlDocumentRequest(request("/products/demo", { headers: { accept: "application/json" } })),
    false,
  );
  assert.equal(isHtmlDocumentRequest(request("/api/products/demo")), false);
  assert.equal(isHtmlDocumentRequest(request("/cover.svg")), false);
  assert.equal(
    isHtmlDocumentRequest(
      request("/products/demo", {
        method: "POST",
        headers: { accept: "text/html", "content-type": "application/json" },
        body: "{}",
      }),
    ),
    false,
  );
});

test("configuration is bounded and contact URL output is escaped", () => {
  const config = resolveConfig({
    ORIGIN_BASE_URL: "https://cabai-origin.example",
    ORIGIN_TIMEOUT_MS: "999999",
    RETRY_AFTER_SECONDS: "0",
    CONTACT_URL: "javascript:alert(1)",
  });

  assert.equal(config.originTimeoutMs, 30000);
  assert.equal(config.retryAfterSeconds, 1);
  assert.equal(config.contactUrl, null);

  const html = renderMaintenancePage('https://example.com/contact?topic=a&note="hello"');
  assert.match(html, /topic=a&amp;note=&quot;hello&quot;/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:woff|js|css)/);
});

test("the deployed fetch handler queues a 5xx notification without changing the origin response", async () => {
  const originalFetch = globalThis.fetch;
  const queued = [];
  const durableObjectEvents = [];
  const originResponse = new Response('{"error":"failed"}', {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  globalThis.fetch = async () => originResponse;

  try {
    const response = await worker.fetch(
      request("/api/agent/readiness", { headers: { accept: "application/json" } }),
      {
        ...ENV,
        MONITORING_ENABLED: "true",
        MONITOR_STATE: {
          idFromName: (name) => name,
          get: () => ({
            fetch: async (url, init) => {
              durableObjectEvents.push({
                path: new URL(url).pathname,
                body: init.body ? JSON.parse(init.body) : null,
              });
              return Response.json({ status: "notified" });
            },
          }),
        },
      },
      { waitUntil: (promise) => queued.push(promise) },
    );

    assert.strictEqual(response, originResponse);
    assert.equal(response.status, 500);
    assert.equal(await response.text(), '{"error":"failed"}');
    await Promise.all(queued);
    assert.deepEqual(durableObjectEvents.filter((event) => event.path === "/origin-failure"), [
      {
        path: "/origin-failure",
        body: {
          status: 500,
          originStatus: 500,
          reason: "origin-status",
          surface: "api",
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTML fallback diagnostics preserve the upstream status and safe reason class", async () => {
  const originalFetch = globalThis.fetch;
  const queued = [];
  const durableObjectEvents = [];
  globalThis.fetch = async () => new Response("origin failed", { status: 500 });

  try {
    const response = await worker.fetch(
      request("/products/demo"),
      {
        ...ENV,
        MONITORING_ENABLED: "true",
        MONITOR_STATE: {
          idFromName: (name) => name,
          get: () => ({
            fetch: async (url, init) => {
              durableObjectEvents.push({
                path: new URL(url).pathname,
                body: init.body ? JSON.parse(init.body) : null,
              });
              return Response.json({ status: "recorded" });
            },
          }),
        },
      },
      { waitUntil: (promise) => queued.push(promise) },
    );

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-cabai-fallback"), "maintenance");
    await Promise.all(queued);
    assert.deepEqual(durableObjectEvents.filter((event) => event.path === "/origin-failure"), [
      {
        path: "/origin-failure",
        body: {
          status: 503,
          originStatus: 500,
          reason: "origin-status",
          surface: "browser",
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network failures are reported without inventing an upstream HTTP status", async () => {
  const originalFetch = globalThis.fetch;
  const queued = [];
  const durableObjectEvents = [];
  globalThis.fetch = async () => {
    throw new Error("simulated network failure");
  };

  try {
    const response = await worker.fetch(
      request("/api/agent/readiness", { headers: { accept: "application/json" } }),
      {
        ...ENV,
        MONITORING_ENABLED: "true",
        MONITOR_STATE: {
          idFromName: (name) => name,
          get: () => ({
            fetch: async (url, init) => {
              durableObjectEvents.push({
                path: new URL(url).pathname,
                body: init.body ? JSON.parse(init.body) : null,
              });
              return Response.json({ status: "recorded" });
            },
          }),
        },
      },
      { waitUntil: (promise) => queued.push(promise) },
    );

    assert.equal(response.status, 503);
    await Promise.all(queued);
    assert.deepEqual(durableObjectEvents.filter((event) => event.path === "/origin-failure"), [
      {
        path: "/origin-failure",
        body: {
          status: 503,
          originStatus: null,
          reason: "network",
          surface: "api",
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
