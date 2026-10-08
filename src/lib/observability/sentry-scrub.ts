import type { ErrorEvent } from "@sentry/nextjs";

const safeTagKeys = new Set([
  "error_code",
  "job_id",
  "method",
  "operation",
  "request_id",
  "route",
  "runtime",
  "surface",
  "trigger",
]);

export function redactOperationalText(value: string): string {
  return value
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/\b(bearer)\s+[a-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .slice(0, 1_000);
}

function safeOperationalText(value: unknown, maximumLength = 1_000): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return undefined;
  }

  try {
    return redactOperationalText(String(value)).slice(0, maximumLength);
  } catch {
    return undefined;
  }
}

function sanitizePathname(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (/^[0-9]+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
      if (/^[a-z0-9_-]{32,}$/i.test(segment)) return ":token";
      return segment;
    })
    .join("/");
}

export function sanitizeOperationalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${sanitizePathname(url.pathname)}`;
  } catch {
    return sanitizePathname(value.split(/[?#]/, 1)[0] ?? "").slice(0, 500);
  }
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  // Rebuild from an allowlist instead of deleting a few known-sensitive
  // fields. Sentry events are extensible and nested SDK data (for example
  // stack-frame vars or trace data) must not bypass this privacy boundary.
  const scrubbed: ErrorEvent = {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: safeOperationalText(event.platform, 100),
    level: event.level,
    environment: safeOperationalText(event.environment, 100),
    release: safeOperationalText(event.release, 200),
  };

  const message = safeOperationalText(event.message);
  if (message) scrubbed.message = message;

  const transaction = sanitizeOperationalUrl(event.transaction);
  if (transaction) scrubbed.transaction = transaction;

  if (event.request) {
    scrubbed.request = {
      method: safeOperationalText(event.request.method, 20),
      url: sanitizeOperationalUrl(event.request.url),
    };
  }

  if (event.tags) {
    scrubbed.tags = Object.fromEntries(
      Object.entries(event.tags)
        .filter(([key]) => safeTagKeys.has(key))
        .flatMap(([key, value]) => {
          const safeValue = safeOperationalText(value, 200);
          return safeValue ? [[key, safeValue]] : [];
        }),
    );
  }

  const trace = event.contexts?.trace as Record<string, unknown> | undefined;
  if (trace) {
    const safeTrace: Record<string, string | boolean> = Object.fromEntries(
      ["trace_id", "span_id", "parent_span_id", "op", "origin", "status"]
        .flatMap((key) => {
          const value = safeOperationalText(trace[key], 200);
          return value ? [[key, value]] : [];
        }),
    );
    if (typeof trace.sampled === "boolean") safeTrace.sampled = trace.sampled;
    if (Object.keys(safeTrace).length > 0) {
      scrubbed.contexts = { trace: safeTrace } as ErrorEvent["contexts"];
    }
  }

  if (event.exception?.values) {
    scrubbed.exception = {
      values: event.exception.values.map((exception) => ({
        type: safeOperationalText(exception.type, 200),
        value: safeOperationalText(exception.value),
        mechanism: exception.mechanism
          ? {
              type: safeOperationalText(exception.mechanism.type, 100) || "generic",
              handled: typeof exception.mechanism.handled === "boolean"
                ? exception.mechanism.handled
                : undefined,
              synthetic: typeof exception.mechanism.synthetic === "boolean"
                ? exception.mechanism.synthetic
                : undefined,
            }
          : undefined,
        stacktrace: exception.stacktrace?.frames
          ? {
              frames: exception.stacktrace.frames.map((frame) => ({
                filename: frame.filename ? sanitizeOperationalUrl(frame.filename) : undefined,
                function: safeOperationalText(frame.function, 300),
                module: safeOperationalText(frame.module, 300),
                lineno: frame.lineno,
                colno: frame.colno,
                in_app: frame.in_app,
              })),
            }
          : undefined,
      })),
    };
  }

  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      category: safeOperationalText(breadcrumb.category, 100),
      level: breadcrumb.level,
      message: safeOperationalText(breadcrumb.message, 500),
      timestamp: breadcrumb.timestamp,
      type: safeOperationalText(breadcrumb.type, 100),
    }));
  }

  return scrubbed;
}
