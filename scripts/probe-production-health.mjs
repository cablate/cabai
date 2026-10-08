#!/usr/bin/env node

const MODES = new Map([
  ["--liveness", { name: "liveness", path: "/api/health", authenticated: false }],
  [
    "--readiness-core",
    {
      name: "readiness-core",
      path: "/api/health/detailed?scope=core",
      authenticated: true,
    },
  ],
  [
    "--readiness-operational",
    {
      name: "readiness-operational",
      path: "/api/health/detailed?scope=operational",
      authenticated: true,
    },
  ],
]);

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 60_000;

function usage() {
  return [
    "Usage: node scripts/probe-production-health.mjs <mode> [--json]",
    "Modes: --liveness | --readiness-core | --readiness-operational",
    "Environment: CABAI_BASE_URL, CRON_SECRET (readiness only), PROBE_TIMEOUT_MS (optional)",
  ].join("\n");
}

function configurationFailure(code, message, jsonOutput) {
  const result = {
    ok: false,
    kind: "configuration",
    code,
    message,
  };
  writeResult(result, jsonOutput);
  process.exitCode = 2;
}

function writeResult(result, jsonOutput) {
  if (jsonOutput) {
    console.log(JSON.stringify(result));
    return;
  }

  const prefix = result.ok ? "OK" : "FAIL";
  const summary = [
    `${prefix} ${result.probe ?? "health-probe"}`,
    result.endpoint ? `endpoint=${result.endpoint}` : null,
    typeof result.httpStatus === "number" ? `http=${result.httpStatus}` : null,
    typeof result.durationMs === "number" ? `duration_ms=${result.durationMs}` : null,
    result.code ? `code=${result.code}` : null,
    result.message,
  ].filter(Boolean).join(" ");

  if (result.ok) console.log(summary);
  else console.error(summary);
}

function parseTimeout(rawValue) {
  if (rawValue === undefined || rawValue === "") return DEFAULT_TIMEOUT_MS;
  if (!/^\d+$/.test(rawValue)) return null;

  const value = Number.parseInt(rawValue, 10);
  return Number.isSafeInteger(value) && value >= MIN_TIMEOUT_MS && value <= MAX_TIMEOUT_MS
    ? value
    : null;
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function resolveEndpoint(baseValue, path) {
  if (!baseValue) return { error: "CABAI_BASE_URL is not configured." };

  let baseUrl;
  try {
    baseUrl = new URL(baseValue);
  } catch {
    return { error: "CABAI_BASE_URL must be a valid HTTP(S) URL." };
  }

  if (
    !["http:", "https:"].includes(baseUrl.protocol)
    || (baseUrl.protocol === "http:" && !isLoopbackHostname(baseUrl.hostname))
    || baseUrl.username
    || baseUrl.password
    || baseUrl.search
    || baseUrl.hash
    || baseUrl.pathname !== "/"
  ) {
    return {
      error: "CABAI_BASE_URL must be an HTTPS origin (HTTP is allowed only for loopback testing) without credentials, path, query, or fragment.",
    };
  }

  const endpoint = new URL(path.replace(/^\//, ""), baseUrl);
  const redactedEndpoint = `${endpoint.protocol}//${endpoint.host}${endpoint.pathname}`;
  return { endpoint, redactedEndpoint };
}

function validateEnvelope(mode, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { code: "INVALID_ENVELOPE", message: "Health endpoint returned an invalid envelope." };
  }

  if (mode.name === "liveness") {
    return body.status === "ok"
      ? null
      : { code: "LIVENESS_NOT_OK", message: "Public liveness is not healthy." };
  }

  const coreHealthy = body.db === "connected" && body.schema?.status === "current";
  const acceptedStatus = mode.name === "readiness-core"
    ? body.status === "ok" || body.status === "degraded"
    : body.status === "ok";

  if (!coreHealthy || !acceptedStatus) {
    return {
      code: mode.name === "readiness-core" ? "CORE_NOT_READY" : "OPERATIONS_NOT_READY",
      message: mode.name === "readiness-core"
        ? "Core readiness is not healthy."
        : "Operational readiness is not healthy.",
    };
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const modeArgs = args.filter((arg) => arg !== "--json");

  if (modeArgs.length !== 1 || !MODES.has(modeArgs[0])) {
    configurationFailure("INVALID_ARGUMENTS", usage(), jsonOutput);
    return;
  }

  const mode = MODES.get(modeArgs[0]);
  const timeoutMs = parseTimeout(process.env.PROBE_TIMEOUT_MS);
  if (timeoutMs === null) {
    configurationFailure(
      "INVALID_TIMEOUT",
      `PROBE_TIMEOUT_MS must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}.`,
      jsonOutput,
    );
    return;
  }

  const resolved = resolveEndpoint(process.env.CABAI_BASE_URL, mode.path);
  if (resolved.error) {
    configurationFailure("INVALID_BASE_URL", resolved.error, jsonOutput);
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (mode.authenticated && !secret) {
    configurationFailure(
      "SECRET_MISSING",
      "CRON_SECRET is required for authenticated readiness probes.",
      jsonOutput,
    );
    return;
  }

  const startedAt = Date.now();
  const signal = AbortSignal.timeout(timeoutMs);
  let response;

  try {
    response = await fetch(resolved.endpoint, {
      headers: mode.authenticated ? { Authorization: `Bearer ${secret}` } : undefined,
      redirect: "manual",
      signal,
    });
  } catch (error) {
    const timedOut = signal.aborted || error?.name === "TimeoutError";
    writeResult({
      ok: false,
      kind: "monitor",
      probe: mode.name,
      endpoint: resolved.redactedEndpoint,
      durationMs: Date.now() - startedAt,
      code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      message: timedOut ? "Health probe timed out." : "Health endpoint could not be reached.",
    }, jsonOutput);
    process.exitCode = 1;
    return;
  }

  const durationMs = Date.now() - startedAt;
  if (!response.ok) {
    writeResult({
      ok: false,
      kind: "monitor",
      probe: mode.name,
      endpoint: resolved.redactedEndpoint,
      httpStatus: response.status,
      durationMs,
      code: `HTTP_${response.status}`,
      message: "Health endpoint returned a non-success status.",
    }, jsonOutput);
    process.exitCode = 1;
    return;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    writeResult({
      ok: false,
      kind: "monitor",
      probe: mode.name,
      endpoint: resolved.redactedEndpoint,
      httpStatus: response.status,
      durationMs,
      code: "INVALID_JSON",
      message: "Health endpoint did not return valid JSON.",
    }, jsonOutput);
    process.exitCode = 1;
    return;
  }

  const envelopeFailure = validateEnvelope(mode, body);
  if (envelopeFailure) {
    writeResult({
      ok: false,
      kind: "monitor",
      probe: mode.name,
      endpoint: resolved.redactedEndpoint,
      httpStatus: response.status,
      durationMs,
      ...envelopeFailure,
    }, jsonOutput);
    process.exitCode = 1;
    return;
  }

  writeResult({
    ok: true,
    kind: "monitor",
    probe: mode.name,
    endpoint: resolved.redactedEndpoint,
    httpStatus: response.status,
    durationMs,
    status: body.status,
    message: "Health probe succeeded.",
  }, jsonOutput);
}

await main();
