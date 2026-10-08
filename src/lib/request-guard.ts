import { getAppBaseUrl } from "@/lib/app-url";

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Reject requests that don't originate from this app.
 *
 * Trust order:
 *   1. If `Origin` is present, it must resolve to our app's origin.
 *   2. If `Origin` is absent (some webview / CLI / server-to-server),
 *      accept only when Fetch Metadata's `Sec-Fetch-Site` confirms the
 *      request is `same-origin` or `none` (top-level navigation).
 *   3. Otherwise reject — previous behaviour treated missing Origin as
 *      "allow", which made the guard a no-op for non-browser clients
 *      (F-11 in remediation-plan.md).
 *
 * Designed for state-changing handlers (POST/PUT/DELETE). GET handlers
 * don't need it and shouldn't call this.
 */
export function assertSameOriginRequest(request: Request): void {
  const reject = () => {
    throw new Response(JSON.stringify({ error: "Invalid request origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  };

  const origin = request.headers.get("origin");

  if (!origin) {
    // Fall through to Fetch Metadata. Major browsers always send Sec-Fetch-*,
    // so a missing Origin from a real browser is usually a same-origin form
    // POST and will still have Sec-Fetch-Site: same-origin.
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite === "same-origin" || secFetchSite === "none") return;
    reject();
    return;
  }

  const originValue = originOf(origin);
  const requestOrigin = originOf(request.url);
  const appOrigin = originOf(getAppBaseUrl());

  if (
    !originValue ||
    (originValue !== requestOrigin && originValue !== appOrigin)
  ) {
    reject();
  }
}
