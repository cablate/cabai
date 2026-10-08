import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { redactOperationalText, sanitizeOperationalUrl, scrubSentryEvent } from "./sentry-scrub";

describe("Sentry privacy boundary", () => {
  it("removes request data, auth material, user identity, extras, and unsafe tags", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "request failed token=private-token for owner@example.com",
      user: { id: "user-1", email: "owner@example.com" },
      extra: { callbackPayload: { order: "private" } },
      request: {
        method: "POST",
        url: "https://cabai.example/api/orders/00000000-0000-4000-8000-000000000123?token=private",
        headers: { authorization: "Bearer private-token", cookie: "session=private" },
        data: { email: "owner@example.com" },
      },
      tags: {
        request_id: "request-1",
        operation: "create order",
        customer_email: "owner@example.com",
      },
      contexts: {
        trace: {
          trace_id: "trace-1",
          span_id: "span-1",
          data: { callbackPayload: "private-trace-data" },
          tags: { customer: "private-trace-tag" },
        },
        customer: { email: "owner@example.com" },
      },
      breadcrumbs: [{
        category: "http",
        message: "Authorization: Bearer private-token",
        data: { body: "private" },
      }],
      exception: {
        values: [{
          type: "Error",
          value: "postgresql://user:password@db/app password=private",
          mechanism: {
            type: "generic",
            handled: true,
            data: { rawPayload: "private-mechanism-data" },
          },
          stacktrace: {
            frames: [{
              filename: "https://cabai.example/_next/server/app.js?token=private",
              function: "renderPage",
              lineno: 42,
              vars: { userEmail: "private-frame-vars" },
            }],
          },
        }],
      },
      threads: { values: [{ id: 1, name: "private-thread-data" }] },
      spans: [{
        trace_id: "trace-1",
        span_id: "span-private",
        start_timestamp: 1,
        data: { payload: "private-span-data" },
      }],
    };

    const scrubbed = scrubSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);

    expect(scrubbed.request).toEqual({
      method: "POST",
      url: "https://cabai.example/api/orders/:id",
    });
    expect(scrubbed.tags).toEqual({ request_id: "request-1", operation: "create order" });
    expect(scrubbed.contexts).toEqual({ trace: expect.objectContaining({ trace_id: "trace-1" }) });
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("owner@example.com");
    expect(serialized).not.toContain("callbackPayload");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("private-trace-data");
    expect(serialized).not.toContain("private-trace-tag");
    expect(serialized).not.toContain("private-mechanism-data");
    expect(serialized).not.toContain("private-frame-vars");
    expect(serialized).not.toContain("private-thread-data");
    expect(serialized).not.toContain("private-span-data");
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: "https://cabai.example/_next/server/app.js",
      function: "renderPage",
      module: undefined,
      lineno: 42,
      colno: undefined,
      in_app: undefined,
    });
  });

  it("removes query strings and opaque route identifiers", () => {
    expect(sanitizeOperationalUrl(
      "https://cabai.example/courses/00000000-0000-4000-8000-000000000100?previewToken=private",
    )).toBe("https://cabai.example/courses/:id");
    expect(sanitizeOperationalUrl("/api/agent/tokens/abcdefghijklmnopqrstuvwxyz1234567890?x=1"))
      .toBe("/api/agent/tokens/:token");
  });

  it("redacts credentials from unexpected error text", () => {
    const redacted = redactOperationalText(
      "postgresql://user:password@db/app Authorization: Bearer abc.def token=secret owner@example.com",
    );

    expect(redacted).not.toMatch(/password@|abc\.def|token=secret|owner@example\.com/);
    expect(redacted).toContain("[redacted]");
  });
});
