import type * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./sentry-scrub";

type SentryOptions = Parameters<typeof Sentry.init>[0];

export function createSentryOptions(options: {
  dsn?: string;
  environment?: string;
  release?: string;
}): SentryOptions {
  return {
    dsn: options.dsn,
    enabled: Boolean(options.dsn),
    environment: options.environment || "unknown",
    release: options.release || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    attachStacktrace: true,
    beforeSend: scrubSentryEvent,
  };
}
