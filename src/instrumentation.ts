/**
 * Next.js Instrumentation — runs once on server startup.
 * Node-only health check logic is in instrumentation.node.ts to avoid
 * webpack bundling pg/fs in the edge runtime bundle.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const mod = await import("./instrumentation.node");
    await mod.onStartup();
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  try {
    return Sentry.captureRequestError(...args);
  } catch {
    return undefined;
  }
};
