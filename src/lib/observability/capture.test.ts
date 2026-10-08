import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  getClient: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

import { captureOperationalException, captureOperationalMessage } from "./capture";

describe("operational Sentry capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentry.getClient.mockReturnValue({});
    sentry.withScope.mockImplementation((callback) => callback({ setTag: sentry.setTag }));
    sentry.captureException.mockReturnValue("event-exception");
    sentry.captureMessage.mockReturnValue("event-message");
  });

  it("uses only the operational tag allowlist", () => {
    expect(captureOperationalException(new Error("boom"), {
      operation: "load course",
      requestId: "request-1",
      route: "/courses/00000000-0000-4000-8000-000000000123?token=private",
    })).toBe("event-exception");

    expect(sentry.setTag).toHaveBeenCalledWith("operation", "load course");
    expect(sentry.setTag).toHaveBeenCalledWith("request_id", "request-1");
    expect(sentry.setTag).toHaveBeenCalledWith("route", "/courses/:id");
  });

  it("is a no-op when the SDK is not configured", () => {
    sentry.getClient.mockReturnValue(undefined);
    expect(captureOperationalMessage("degraded", "warning", { surface: "startup" })).toBeUndefined();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["getClient", () => sentry.getClient.mockImplementation(() => { throw new Error("sdk failed"); })],
    ["withScope", () => sentry.withScope.mockImplementation(() => { throw new Error("sdk failed"); })],
    ["captureException", () => sentry.captureException.mockImplementation(() => { throw new Error("sdk failed"); })],
  ])("never propagates an SDK failure from %s", (_label, arrange) => {
    arrange();
    expect(() => captureOperationalException(new Error("original"), { surface: "api" })).not.toThrow();
    expect(captureOperationalException(new Error("original"), { surface: "api" })).toBeUndefined();
  });
});
