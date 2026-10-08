#!/usr/bin/env tsx

type ExpectedResponse = {
  name: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  statuses: number[];
  locationIncludes?: string;
  assertJson?: (json: unknown) => string | null;
  assertText?: (text: string) => string | null;
};

const baseUrl = normalizeBaseUrl(process.env.BASE_URL || "http://127.0.0.1:3000");
const productId = process.env.SMOKE_PRODUCT_ID?.trim();
const productSlug = process.env.SMOKE_PRODUCT_SLUG?.trim();
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10_000);
const waitAttempts = Number(process.env.SMOKE_WAIT_ATTEMPTS || 30);

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildUrl(path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer(): Promise<void> {
  const healthUrl = buildUrl("/api/health");
  let lastError = "";

  for (let i = 1; i <= waitAttempts; i++) {
    try {
      const response = await fetchWithTimeout(healthUrl);
      if (response.status === 200) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Server did not become healthy at ${healthUrl}: ${lastError}`);
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

const checks: ExpectedResponse[] = [
  {
    name: "health (public liveness only)",
    path: "/api/health",
    statuses: [200],
    assertJson: (json) => {
      const body = jsonObject(json);
      if (body?.status !== "ok") return "health status is not ok";
      // F-15: public /api/health no longer reports DB readiness. The
      // detailed endpoint (`/api/health/detailed`) is CRON_SECRET-gated
      // and exercised separately by infra monitors.
      return null;
    },
  },
  { name: "home page", path: "/", statuses: [200] },
  { name: "products page", path: "/products", statuses: [200] },
  { name: "library page", path: "/library", statuses: [200] },
  { name: "skills page", path: "/skills", statuses: [200] },
  {
    name: "public Library Agent API",
    path: "/api/agent/public/v1/library",
    statuses: [200],
  },
  {
    name: "public Skills Agent API",
    path: "/api/agent/public/v1/skills",
    statuses: [200],
  },
  {
    name: "User Agent OpenAPI exposes public and User operations",
    path: "/api/agent/user/v1/openapi.yaml",
    statuses: [200],
    assertText: (body) => {
      const required = ["listPublicLibraryEntries", "listPublicSkills", "listUnreadInformation", "acknowledgeInformation"];
      const missing = required.filter((operationId) => !body.includes(`operationId: ${operationId}`));
      return missing.length > 0 ? `missing operationId(s): ${missing.join(", ")}` : null;
    },
  },
  {
    name: "full Admin OpenAPI rejects missing key",
    path: "/api/agent/openapi.yaml",
    statuses: [401],
  },
  { name: "login page", path: "/login", statuses: [200] },
  {
    name: "dashboard requires login",
    path: "/dashboard",
    statuses: [302, 303, 307, 308],
    locationIncludes: "/login",
  },
  {
    name: "admin requires login",
    path: "/admin",
    statuses: [302, 303, 307, 308],
    locationIncludes: "/login",
  },
  {
    name: "agent API rejects missing key",
    path: "/api/agent/plans",
    statuses: [401],
  },
  {
    name: "User Information API rejects missing key",
    path: "/api/agent/user/v1/information",
    statuses: [401],
  },
  {
    name: "Admin Information API rejects missing key",
    path: "/api/agent/information",
    statuses: [401],
  },
  {
    name: "agent publish check rejects missing key",
    path: "/api/agent/readiness",
    method: "POST",
    body: { courseId: "smoke-test" },
    statuses: [401],
  },
  {
    // F-16: cron endpoints are POST now (state-changing). Without the
    // CRON_SECRET header the handler must still reject before touching
    // anything; GET on the same path will return 405 from Next.js and
    // isn't a meaningful auth check.
    name: "cron endpoint rejects missing secret",
    path: "/api/cron/reconcile",
    method: "POST",
    statuses: [401],
  },
  {
    name: "entitlement endpoint rejects missing service key",
    path: "/api/entitlements/list?plan_id=smoke-test",
    statuses: [401],
  },
];

if (productId) {
  checks.splice(3, 0, {
    name: productSlug ? "product detail canonical redirect" : "product detail page",
    path: `/products/${encodeURIComponent(productId)}`,
    statuses: productSlug ? [308] : [200, 308],
    ...(productSlug
      ? { locationIncludes: `/products/${encodeURIComponent(productSlug)}` }
      : {}),
  });
}

if (productSlug) {
  checks.splice(4, 0, {
    name: "product detail canonical page",
    path: `/products/${encodeURIComponent(productSlug)}`,
    statuses: [200],
  });
}

async function runCheck(check: ExpectedResponse): Promise<void> {
  const headers = new Headers(check.headers);
  let body: string | undefined;

  if (check.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(check.body);
  }

  const response = await fetchWithTimeout(buildUrl(check.path), {
    method: check.method || "GET",
    headers,
    body,
  });

  if (!check.statuses.includes(response.status)) {
    throw new Error(
      `${check.name}: expected ${check.statuses.join("/")}, got ${response.status}`,
    );
  }

  if (check.locationIncludes) {
    const location = response.headers.get("location") || "";
    if (!location.includes(check.locationIncludes)) {
      throw new Error(
        `${check.name}: expected Location to include ${check.locationIncludes}, got ${location || "<empty>"}`,
      );
    }
  }

  if (check.assertJson) {
    const json = await response.json();
    const error = check.assertJson(json);
    if (error) throw new Error(`${check.name}: ${error}`);
  }

  if (check.assertText) {
    const content = await response.text();
    const error = check.assertText(content);
    if (error) throw new Error(`${check.name}: ${error}`);
  }
}

async function main(): Promise<void> {
  console.log(`[smoke] baseUrl=${baseUrl}`);
  if (productId) console.log(`[smoke] productId=${productId}`);
  if (productSlug) console.log(`[smoke] productSlug=${productSlug}`);

  await waitForServer();

  const failures: string[] = [];
  for (const check of checks) {
    try {
      await runCheck(check);
      console.log(`[smoke] PASS ${check.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(message);
      console.error(`[smoke] FAIL ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`[smoke] ${failures.length} check(s) failed`);
    process.exit(1);
  }

  console.log(`[smoke] all ${checks.length} checks passed`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
