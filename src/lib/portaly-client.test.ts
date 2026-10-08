import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function response(body: string, status = 200, contentType = "application/json"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

beforeEach(() => {
  vi.stubEnv("PORTALY_MODE", "test");
  vi.stubEnv("PORTALY_API_KEY", "pcs_test_example");
  vi.stubEnv("PORTALY_CALLBACK_SECRET", "matching-callback-secret");
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Portaly HTTP policy", () => {
  it("bounds every request with an abort signal", async () => {
    const { getPlan } = await import("./portaly-client");
    const fetchMock = vi.fn().mockResolvedValue(response('{"data":{"id":"plan-1"}}'));
    vi.stubGlobal("fetch", fetchMock);

    await getPlan("plan-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("lets unified API-key auth derive the merchant profile", async () => {
    vi.stubEnv("PORTALY_PROFILE_ID", "");
    vi.resetModules();
    const { getPlans: getUnifiedPlans } = await import("./portaly-client");
    const fetchMock = vi.fn().mockResolvedValue(response('{"data":[]}'));
    vi.stubGlobal("fetch", fetchMock);

    await getUnifiedPlans();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://portaly.ai/api/creator-subscription/plans",
      expect.any(Object),
    );
  });

  it("retries one idempotent GET after a 5xx response", async () => {
    const { getPlan } = await import("./portaly-client");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response("upstream unavailable", 502, "text/plain"))
      .mockResolvedValueOnce(response('{"data":{"id":"plan-1"}}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPlan("plan-1")).resolves.toEqual({ data: { id: "plan-1" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not automatically retry a checkout POST", async () => {
    const { createCheckoutSession } = await import("./portaly-client");
    const fetchMock = vi.fn().mockResolvedValue(response("upstream unavailable", 502, "text/plain"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createCheckoutSession({
      planId: "plan-1",
      merchantOrderNumber: "order-1",
      callbackUrl: "https://example.com/callback",
      successRedirectUrl: "https://example.com/success",
      cancelRedirectUrl: "https://example.com/cancel",
    });

    expect(result).toEqual({ error: "Portaly request failed (HTTP 502)." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a stable error for a successful non-JSON response", async () => {
    const { portalyFetch } = await import("./portaly-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("not json", 200, "text/plain")));
    await expect(portalyFetch("/health-like-endpoint")).resolves.toEqual({
      error: "Portaly returned an invalid JSON response.",
    });
  });

  it("classifies an aborted request without exposing the thrown value", async () => {
    const { portalyFetch } = await import("./portaly-client");
    const timeout = new DOMException("private upstream detail", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    await expect(portalyFetch("/read")).resolves.toEqual({ error: "Portaly request timed out." });
  });

  it("does not call Portaly when payment configuration is invalid", async () => {
    vi.stubEnv("PORTALY_MODE", "live");
    vi.stubEnv("PORTALY_API_KEY", "pcs_test_wrong-mode");
    vi.resetModules();
    const { createCheckoutSession } = await import("./portaly-client");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createCheckoutSession({
      planId: "plan-1",
      merchantOrderNumber: "order-1",
      callbackUrl: "https://example.com/callback",
      successRedirectUrl: "https://example.com/success",
      cancelRedirectUrl: "https://example.com/cancel",
    })).resolves.toEqual({ error: "Portaly payment configuration is unavailable." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
