import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(new URL("./probe-production-health.mjs", import.meta.url));
const TEST_SECRET = "probe-test-secret-value";

async function withServer(handler, callback) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert(address && typeof address === "object");

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function runProbe(baseUrl, args, env = {}) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    env: {
      ...process.env,
      CABAI_BASE_URL: baseUrl,
      CRON_SECRET: TEST_SECRET,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const [exitCode] = await once(child, "close");
  return { exitCode, stdout, stderr };
}

test("public liveness accepts the stable 200 envelope without sending a secret", async () => {
  let authorization;

  await withServer((request, response) => {
    authorization = request.headers.authorization;
    assert.equal(request.url, "/api/health");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  }, async (baseUrl) => {
    const result = await runProbe(baseUrl, ["--liveness", "--json"]);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(authorization, undefined);
    assert.equal(output.ok, true);
    assert.equal(output.probe, "liveness");
    assert.equal(output.httpStatus, 200);
  });
});

test("core readiness authenticates by header and accepts visible optional degradation", async () => {
  await withServer((request, response) => {
    assert.equal(request.url, "/api/health/detailed?scope=core");
    assert.equal(request.headers.authorization, `Bearer ${TEST_SECRET}`);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: "degraded",
      db: "connected",
      schema: { status: "current" },
    }));
  }, async (baseUrl) => {
    const result = await runProbe(baseUrl, ["--readiness-core", "--json"]);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(output.status, "degraded");
    assert.equal(output.endpoint, `${baseUrl}/api/health/detailed`);
    assert.doesNotMatch(result.stdout, /scope=core/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_SECRET));
  });
});

test("operational readiness exits nonzero for a 503 response", async () => {
  await withServer((request, response) => {
    assert.equal(request.url, "/api/health/detailed?scope=operational");
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "degraded", details: "must-not-be-echoed" }));
  }, async (baseUrl) => {
    const result = await runProbe(baseUrl, ["--readiness-operational", "--json"]);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(output.ok, false);
    assert.equal(output.code, "HTTP_503");
    assert.equal(output.httpStatus, 503);
    assert.equal(output.endpoint, `${baseUrl}/api/health/detailed`);
    assert.doesNotMatch(result.stdout, /scope=operational|must-not-be-echoed/);
  });
});

test("probe timeout is bounded and reported without the target query", async () => {
  await withServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
    }, 150);
  }, async (baseUrl) => {
    const result = await runProbe(
      baseUrl,
      ["--readiness-operational", "--json"],
      { PROBE_TIMEOUT_MS: "50" },
    );
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(output.code, "TIMEOUT");
    assert.doesNotMatch(result.stdout, /scope=operational/);
  });
});

test("invalid JSON is a monitor failure", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("not-json");
  }, async (baseUrl) => {
    const result = await runProbe(baseUrl, ["--liveness", "--json"]);
    const output = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 1);
    assert.equal(output.code, "INVALID_JSON");
  });
});

test("authentication rejection fails without exposing credentials or response details", async () => {
  await withServer((_request, response) => {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "unauthorized", supplied: TEST_SECRET }));
  }, async (baseUrl) => {
    const result = await runProbe(baseUrl, ["--readiness-core"]);

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /code=HTTP_401/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_SECRET));
    assert.doesNotMatch(result.stdout + result.stderr, /supplied|scope=core/);
  });
});

test("operational readiness requires a fully healthy readiness envelope", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: "ok",
      db: "connected",
      schema: { status: "current" },
    }));
  }, async (baseUrl) => {
    const result = await runProbe(baseUrl, ["--readiness-operational"]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^OK readiness-operational /);
    assert.equal(result.stderr, "");
  });
});

test("authenticated probes reject cleartext non-loopback targets before sending a secret", async () => {
  const result = await runProbe("http://cabai.example", ["--readiness-core", "--json"]);
  const output = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 2);
  assert.equal(output.code, "INVALID_BASE_URL");
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(TEST_SECRET));
});
