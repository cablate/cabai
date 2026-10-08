import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const captureOperationalException = vi.hoisted(() => vi.fn());
const captureOperationalMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/capture", () => ({
  captureOperationalException,
  captureOperationalMessage,
}));
import {
  ApiError,
  dataResponse,
  parsePathParams,
  parseQuery,
  parseJsonBody,
  requiredQueryParam,
  successResponse,
  withApiHandler,
} from "@/lib/api-route";

async function thrownApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Expected promise to throw an ApiError");
}

describe("api route foundation", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("parses and validates JSON bodies", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ name: "Cab AI" }),
    });

    await expect(parseJsonBody(request, schema)).resolves.toEqual({
      name: "Cab AI",
    });
  });

  it("returns a consistent empty-body error", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "   ",
    });
    const error = await thrownApiError(parseJsonBody(request, schema));
    expect(error).toMatchObject({
      code: "EMPTY_JSON_BODY",
      status: 400,
      message: "Request body is empty — expected JSON",
    });
  });

  it("returns a consistent malformed-JSON error", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: "{broken",
    });
    const error = await thrownApiError(parseJsonBody(request, schema));
    expect(error).toMatchObject({
      code: "MALFORMED_JSON",
      status: 400,
      message: "Request body is not valid JSON (received 7 chars)",
    });
  });

  it("optionally includes flattened Zod field errors", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const error = await thrownApiError(
      parseJsonBody(request, schema, { includeDetails: true }),
    );
    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect((error.details as Record<string, string[]>).name).toHaveLength(1);
  });

  it("passes thrown Response instances through unchanged", async () => {
    const logger = { error: vi.fn(), info: vi.fn() };
    const expected = Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "x-auth": "agent" } },
    );
    const handler = withApiHandler(
      { logger, operation: "authenticate", createRequestId: () => "request-1" },
      async () => {
        throw expected;
      },
    );

    const actual = await handler(new Request("https://example.com/api"));
    expect(actual).toBe(expected);
    expect(actual.headers.get("x-auth")).toBe("agent");
    expect(actual.headers.get("x-request-id")).toBe("request-1");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs unexpected errors once and returns the configured 500 envelope", async () => {
    const logger = { error: vi.fn(), info: vi.fn() };
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125);
    const handler = withApiHandler(
      {
        logger,
        operation: "load content",
        internalError: "Server error",
        createRequestId: () => "request-2",
        now,
      },
      async () => {
        throw new Error("database unavailable");
      },
    );

    const response = await handler(new Request("https://example.com/api"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Server error" });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith("Failed to load content", {
      requestId: "request-2",
      operation: "load content",
      error: "database unavailable",
    });
    expect(captureOperationalException).toHaveBeenCalledWith(expect.any(Error), {
      errorCode: "INTERNAL_ERROR",
      method: "GET",
      operation: "load content",
      requestId: "request-2",
      route: "https://example.com/api",
      runtime: "nodejs",
      surface: "api",
    });
    expect(captureOperationalMessage).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("API request completed", {
      requestId: "request-2",
      operation: "load content",
      method: "GET",
      status: 500,
      durationMs: 25,
      errorCode: "INTERNAL_ERROR",
    });
  });

  it("captures a redacted operational event when an inner handler returns 5xx", async () => {
    captureOperationalException.mockClear();
    captureOperationalMessage.mockClear();
    const logger = { error: vi.fn(), info: vi.fn() };
    const handler = withApiHandler(
      { logger, operation: "process callback", createRequestId: () => "request-returned-500" },
      async () => Response.json({ error: "provider details must not be captured" }, { status: 503 }),
    );

    const response = await handler(new Request("https://example.com/api/callback?token=private", {
      method: "POST",
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBe("request-returned-500");
    expect(captureOperationalException).not.toHaveBeenCalled();
    expect(captureOperationalMessage).toHaveBeenCalledWith(
      "API handler returned a server error",
      "error",
      {
        errorCode: "HTTP_503",
        method: "POST",
        operation: "process callback",
        requestId: "request-returned-500",
        route: "https://example.com/api/callback?token=private",
        runtime: "nodejs",
        surface: "api",
      },
    );
  });

  it("keeps data, success, and query-param envelopes stable", async () => {
    await expect(dataResponse({ id: "course-1" }, 201).json()).resolves.toEqual({
      data: { id: "course-1" },
    });
    await expect(successResponse().json()).resolves.toEqual({ success: true });
    expect(
      requiredQueryParam(
        new Request("https://example.com/api?courseId=course-1"),
        "courseId",
      ),
    ).toBe("course-1");
    expect(
      requiredQueryParam(
        new Request("https://example.com/api?courseId=%20%20"),
        "courseId",
      ),
    ).toBe("  ");
  });

  it("maps typed API errors without exposing their cause", async () => {
    const logger = { error: vi.fn(), info: vi.fn() };
    const handler = withApiHandler(
      {
        logger,
        operation: "validate request",
        includeErrorCode: true,
        createRequestId: () => "request-3",
      },
      async () => {
        throw new ApiError({
          code: "RESOURCE_CONFLICT",
          message: "Resource already exists",
          status: 409,
          details: { field: "name" },
          cause: new Error("unique constraint api_keys_name_key"),
        });
      },
    );

    const response = await handler(new Request("https://example.com/api"));
    await expect(response.json()).resolves.toEqual({
      error: "Resource already exists",
      code: "RESOURCE_CONFLICT",
      details: { field: "name" },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("validates query and path parameters with typed errors", async () => {
    expect(
      parseQuery(new Request("https://example.com/api?page=2"), z.object({ page: z.coerce.number().int() })),
    ).toEqual({ page: 2 });
    await expect(
      parsePathParams({ params: Promise.resolve({ id: "course-1" }) }, z.object({ id: z.string().min(1) })),
    ).resolves.toEqual({ id: "course-1" });

    expect(() => parseQuery(new Request("https://example.com/api?page=bad"), z.object({ page: z.coerce.number() }))).toThrowError(ApiError);
  });
});
