import * as Sentry from "@sentry/nextjs";
import { createSentryOptions } from "./src/lib/observability/sentry-options";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init(createSentryOptions({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE || process.env.APP_VERSION || process.env.GIT_COMMIT_SHA,
  }));
}
