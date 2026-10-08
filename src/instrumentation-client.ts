import * as Sentry from "@sentry/nextjs";
import { createSentryOptions } from "@/lib/observability/sentry-options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init(createSentryOptions({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION || process.env.SENTRY_RELEASE,
  }));
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
