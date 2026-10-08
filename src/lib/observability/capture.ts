import * as Sentry from "@sentry/nextjs";
import { sanitizeOperationalUrl } from "./sentry-scrub";

export interface SafeCaptureContext {
  errorCode?: string;
  jobId?: string;
  method?: string;
  operation?: string;
  requestId?: string;
  route?: string;
  runtime?: string;
  surface?: string;
  trigger?: string;
}

function safeTags(context: SafeCaptureContext): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      error_code: context.errorCode,
      job_id: context.jobId,
      method: context.method,
      operation: context.operation,
      request_id: context.requestId,
      route: sanitizeOperationalUrl(context.route),
      runtime: context.runtime,
      surface: context.surface,
      trigger: context.trigger,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );
}

export function captureOperationalException(error: unknown, context: SafeCaptureContext): string | undefined {
  try {
    if (!Sentry.getClient()) return undefined;
    return Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(safeTags(context))) scope.setTag(key, value.slice(0, 200));
      return Sentry.captureException(error);
    });
  } catch {
    // Observability is optional. SDK or transport failures must never replace
    // the original API/render/startup behavior with a second exception.
    return undefined;
  }
}

export function captureOperationalMessage(
  message: string,
  level: "warning" | "error",
  context: SafeCaptureContext,
): string | undefined {
  try {
    if (!Sentry.getClient()) return undefined;
    return Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(safeTags(context))) scope.setTag(key, value.slice(0, 200));
      return Sentry.captureMessage(message, level);
    });
  } catch {
    return undefined;
  }
}
