import type { z } from "zod";
import { captureOperationalException, captureOperationalMessage } from "@/lib/observability/capture";

export interface ApiLogger {
  info?: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

export interface ApiRequestContext {
  requestId: string;
  operation: string;
  startedAt: number;
  actor?: { type: "agent" | "user" | "admin" | "system"; id: string };
  scope?: string;
  resource?: { type: string; id?: string };
}

interface ApiHandlerOptions {
  logger: ApiLogger;
  operation: string;
  internalError?: string;
  includeErrorCode?: boolean;
  createRequestId?: () => string;
  now?: () => number;
}

interface ParseJsonOptions {
  invalidMessage?: string;
  includeDetails?: boolean;
}

type ApiRouteHandler<TContext> = (
  request: Request,
  context?: TContext,
  requestContext?: ApiRequestContext,
) => Response | Promise<Response>;

export interface ApiErrorOptions {
  code: string;
  message: string;
  status: number;
  details?: unknown;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor({ code, message, status, details, cause }: ApiErrorOptions) {
    super(message, { cause });
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function dataResponse<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status });
}

export function successResponse(status = 200): Response {
  return Response.json({ success: true }, { status });
}

export function errorResponse(
  error: string,
  status: number,
  details?: unknown,
  code?: string,
): Response {
  const body = {
    error,
    ...(code === undefined ? {} : { code }),
    ...(details === undefined ? {} : { details }),
  };
  return Response.json(
    body,
    { status },
  );
}

export function requiredQueryParam(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name);
  if (!value) {
    throw new ApiError({
      code: "INVALID_QUERY",
      message: `${name} query param is required`,
      status: 400,
    });
  }
  return value;
}

export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
  options: ParseJsonOptions = {},
): Promise<z.infer<TSchema>> {
  const text = await request.text();

  if (text.trim().length === 0) {
    throw new ApiError({
      code: "EMPTY_JSON_BODY",
      message: "Request body is empty — expected JSON",
      status: 400,
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError({
      code: "MALFORMED_JSON",
      message: `Request body is not valid JSON (received ${text.length} chars)`,
      status: 400,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: options.invalidMessage ?? "Invalid input",
      status: 400,
      details: options.includeDetails ? parsed.error.flatten().fieldErrors : undefined,
    });
  }

  return parsed.data;
}

export function parseQuery<TSchema extends z.ZodTypeAny>(request: Request, schema: TSchema): z.infer<TSchema> {
  const values = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    throw new ApiError({
      code: "INVALID_QUERY",
      message: "Invalid query parameters",
      status: 400,
      details: parsed.error.flatten().fieldErrors,
    });
  }
  return parsed.data;
}

export async function parsePathParams<TSchema extends z.ZodTypeAny>(
  context: { params: Record<string, string> | Promise<Record<string, string>> },
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const parsed = schema.safeParse(await context.params);
  if (!parsed.success) {
    throw new ApiError({
      code: "INVALID_PATH",
      message: "Invalid path parameters",
      status: 400,
      details: parsed.error.flatten().fieldErrors,
    });
  }
  return parsed.data;
}

export function withApiHandler<TContext = unknown>(
  options: ApiHandlerOptions,
  handler: ApiRouteHandler<TContext>,
): ApiRouteHandler<TContext> {
  return async (request, context) => {
    const now = options.now ?? Date.now;
    const requestContext: ApiRequestContext = {
      requestId: options.createRequestId?.() ?? crypto.randomUUID(),
      operation: options.operation,
      startedAt: now(),
    };
    let response: Response;
    let errorCode: string | undefined;
    let capturedUnhandledException = false;
    try {
      response = await handler(request, context, requestContext);
    } catch (error) {
      if (error instanceof Response) {
        response = error;
      } else if (error instanceof ApiError) {
        errorCode = error.code;
        response = errorResponse(
          error.message,
          error.status,
          error.details,
          options.includeErrorCode ? error.code : undefined,
        );
      } else {
        errorCode = "INTERNAL_ERROR";
        captureOperationalException(error, {
          errorCode,
          method: request.method,
          operation: options.operation,
          requestId: requestContext.requestId,
          route: request.url,
          runtime: "nodejs",
          surface: "api",
        });
        capturedUnhandledException = true;
        options.logger.error(`Failed to ${options.operation}`, {
          requestId: requestContext.requestId,
          operation: options.operation,
          error: error instanceof Error ? error.message : String(error),
        });
        response = errorResponse(
          options.internalError ?? "Internal server error",
          500,
          undefined,
          options.includeErrorCode ? errorCode : undefined,
        );
      }
    }
    response.headers.set("x-request-id", requestContext.requestId);
    if (response.status >= 500 && !capturedUnhandledException) {
      errorCode ??= `HTTP_${response.status}`;
      captureOperationalMessage("API handler returned a server error", "error", {
        errorCode,
        method: request.method,
        operation: options.operation,
        requestId: requestContext.requestId,
        route: request.url,
        runtime: "nodejs",
        surface: "api",
      });
    }
    options.logger.info?.("API request completed", {
      requestId: requestContext.requestId,
      operation: options.operation,
      method: request.method,
      status: response.status,
      durationMs: Math.max(0, now() - requestContext.startedAt),
      ...(errorCode ? { errorCode } : {}),
    });
    return response;
  };
}
