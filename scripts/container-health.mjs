#!/usr/bin/env node

const mode = process.argv[2] ?? "--liveness";
if (mode !== "--liveness" && mode !== "--readiness") {
  console.error("Usage: node scripts/container-health.mjs [--liveness|--readiness]");
  process.exit(2);
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Container health check failed: PORT must be an integer from 1 to 65535.");
  process.exit(1);
}

const readiness = mode === "--readiness";
const secret = process.env.CRON_SECRET;
if (readiness && !secret) {
  console.error("Container readiness check failed: CRON_SECRET is not configured.");
  process.exit(1);
}

const path = readiness ? "/api/health/detailed?scope=core" : "/api/health";
const headers = readiness ? { Authorization: `Bearer ${secret}` } : undefined;

try {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers,
    signal: AbortSignal.timeout(4_000),
  });
  const body = await response.json().catch(() => null);
  const acceptedStatus = body?.status === "ok" || (readiness && body?.status === "degraded");
  if (!response.ok || !acceptedStatus) {
    throw new Error(`endpoint returned HTTP ${response.status}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Container ${readiness ? "readiness" : "liveness"} check failed: ${message}`);
  process.exit(1);
}
