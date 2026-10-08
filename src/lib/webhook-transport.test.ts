import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { assertSafeOutboundUrl, isPrivateAddress } from "./url-safety";
import { postWebhook } from "./webhook-transport";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});
afterEach(() => vi.restoreAllMocks());

describe("outbound address policy", () => {
  it.each([
    "127.0.0.1", "10.0.0.1", "169.254.169.254", "172.31.0.1", "192.168.0.1",
    "100.64.1.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "192.0.2.1",
    "[::1]", "0:0:0:0:0:0:0:1", "::", "::ffff:127.0.0.1", "[::ffff:7f00:1]",
    "fd12::1", "fe90::1", "ff02::1", "64:ff9b::7f00:1", "2002:7f00:1::",
    "2001:db8::1", "not-an-ip",
  ])("rejects non-global or ambiguous address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });
  it.each(["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "[2001:4860:4860::8888]"])("permits ordinary public address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
  it.each([
    "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://0177.0.0.1/",
    "https://0x7f000001/", "http://example.com/", "https://user:password@example.com/",
  ])("rejects unsafe URL before transport: %s", async (url) => {
    await expect(postWebhook(url, { headers: {}, body: "{}" })).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([{ answers: [] }, { answers: [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }] }])("rejects empty or mixed-private DNS answer sets", async ({ answers }) => {
    mocks.lookup.mockResolvedValue(answers);
    await expect(assertSafeOutboundUrl("https://example.com")).rejects.toThrow("non-public");
  });
});

function transport(status: number, body = "ok", finish = true) {
  const stream = new PassThrough();
  const response = stream as unknown as IncomingMessage;
  response.statusCode = status;
  response.headers = { location: "https://127.0.0.1/private" };
  const req = Object.assign(new EventEmitter(), {
    end: vi.fn(),
    destroy: vi.fn((error?: Error) => { if (error) req.emit("error", error); return req; }),
  });
  mocks.request.mockImplementation((_url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    options.signal?.addEventListener("abort", () => req.destroy(new Error("aborted")), { once: true });
    req.end.mockImplementation(() => queueMicrotask(() => {
      callback(response);
      if (finish) stream.end(Buffer.from(body));
    }));
    return req;
  });
  return req;
}

describe("pinned HTTPS webhook transport", () => {
  it("pins the checked address while retaining the original HTTPS identity, signature and body", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const req = transport(200);
    const headers = { "x-entitlement-signature": "test-signature", "Content-Type": "application/json" };
    await expect(postWebhook("https://example.com:8443/hook?q=1", { headers, body: '{"hello":"世界"}' })).resolves.toEqual({ ok: true, status: 200, text: "" });
    const [url, options] = mocks.request.mock.calls[0]!;
    expect(url.href).toBe("https://example.com:8443/hook?q=1");
    expect(options).toMatchObject({ method: "POST", headers, agent: false, rejectUnauthorized: true });
    const single = vi.fn(); const all = vi.fn();
    options.lookup("example.com", {}, single);
    options.lookup("example.com", { all: true }, all);
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(req.end).toHaveBeenCalledWith('{"hello":"世界"}');
  });
  it.each([301, 302, 307, 308, 400, 500])("returns status %i without following redirects", async (status) => {
    transport(status);
    const result = await postWebhook("https://example.com", { headers: {}, body: "{}" });
    expect(result).toMatchObject({ ok: false, status });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([400, 503])("bounds oversized HTTP %i bodies without losing the retry classification", async (status) => {
    const req = transport(status, "x".repeat(65537));
    const result = await postWebhook("https://example.com", { headers: {}, body: "{}" });
    expect(result).toMatchObject({ ok: false, status });
    expect(result.text).toContain("body discarded");
    expect(req.destroy).toHaveBeenCalled();
  });
  it("accepts successful headers without waiting for an unused body", async () => {
    transport(204, "", false);
    await expect(postWebhook("https://example.com", { headers: {}, body: "{}" })).resolves.toMatchObject({ ok: true, status: 204 });
  });
  it("bounds DNS waiting and never sends after the total deadline", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    const promise = postWebhook("https://example.com", { headers: {}, body: "{}" });
    controller.abort(new Error("deadline"));
    await expect(promise).rejects.toThrow("deadline");
    expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("uses the same deadline to abort a stalled response", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const req = transport(400, "", false);
    const promise = postWebhook("https://example.com", { headers: {}, body: "{}" });
    await vi.waitFor(() => expect(req.end).toHaveBeenCalled());
    controller.abort();
    await expect(promise).resolves.toMatchObject({ status: 400, text: "Response body unavailable: aborted" });
    expect(req.destroy).toHaveBeenCalled();
  });
});
