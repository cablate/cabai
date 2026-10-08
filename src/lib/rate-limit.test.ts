import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "./rate-limit";

afterEach(() => vi.unstubAllEnvs());
describe("trusted ingress IP boundary", () => {
  it.each(["development", "production", "test"])("ignores caller-chosen headers by default in %s", (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    expect(getClientIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2", "x-real-ip": "3.3.3.3" }))).toBe("unknown");
  });
  it.each(["x-real-ip", "cf-connecting-ip"])("only accepts a single IP from explicitly trusted %s", (header) => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", header);
    expect(getClientIp(new Headers({ [header]: "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(getClientIp(new Headers({ "x-forwarded-for": "2.2.2.2" }))).toBe("unknown");
  });
  it.each(["not-ip", "1.1.1.1, 2.2.2.2", "127.1", "[::1]", "fe80::1%eth0", "1.1.1.1:443"])("rejects malformed or multiple values: %s", (value) => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(getClientIp(new Headers({ "x-real-ip": value }))).toBe("unknown");
  });
  it("canonicalizes equivalent IPv6 values to one bucket", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(getClientIp(new Headers({ "x-real-ip": "2001:4860:0000:0000:0000:0000:0000:ABCD" }))).toBe("2001:4860::abcd");
  });
  it("fails closed for unsupported configuration", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-forwarded-for");
    expect(getClientIp(new Headers({ "x-forwarded-for": "1.1.1.1" }))).toBe("unknown");
  });
});
