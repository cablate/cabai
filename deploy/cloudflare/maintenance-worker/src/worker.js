const DEFAULT_ORIGIN_TIMEOUT_MS = 8_000;
const MIN_ORIGIN_TIMEOUT_MS = 250;
const MAX_ORIGIN_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_RETRY_AFTER_SECONDS = 3_600;
const EDGE_HOP_HEADER = "X-CabAI-Edge-Hop";
const EDGE_HOP_VALUE = "maintenance-worker";

import {
  CabaiMonitorState,
  ensureMonitorAlarm,
  queueOriginFailure,
  triggerScheduledMonitor,
} from "./monitor.js";

export { CabaiMonitorState };

const MAINTENANCE_STATUS_CODES = new Set([500, 502, 503, 504]);
const CLOUDFLARE_TRANSPORT_STATUS_MIN = 520;
const CLOUDFLARE_TRANSPORT_STATUS_MAX = 530;
const MONITOR_ALARM_BOOTSTRAP_COOLDOWN_MS = 5 * 60 * 1000;
const MONITOR_ALARM_BOOTSTRAP_RETRY_MS = 60 * 1000;
const NON_DOCUMENT_PREFIXES = ["/api", "/_next", "/assets", "/images", "/fonts"];
const NON_DOCUMENT_PATHS = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/site.webmanifest",
  "/apple-touch-icon.png",
]);
const STATIC_FILE_EXTENSION =
  /\.(?:avif|css|csv|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|pdf|png|svg|ttf|txt|wav|webm|webp|woff2?|xml|zip)$/i;

let monitorAlarmBootstrapAfter = 0;
const originFailureDiagnostics = new WeakMap();

function withOriginFailureDiagnostic(response, reason, originStatus = null) {
  originFailureDiagnostics.set(response, { reason, originStatus });
  return response;
}

class OriginConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "OriginConfigurationError";
  }
}

class OriginUnavailableError extends Error {
  constructor(kind) {
    super(kind);
    this.name = "OriginUnavailableError";
    this.kind = kind;
  }
}

function parseBoundedInteger(value, fallback, minimum, maximum) {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseOriginBaseUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OriginConfigurationError("ORIGIN_BASE_URL is required");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new OriginConfigurationError("ORIGIN_BASE_URL must be an absolute URL");
  }

  const localHttp = url.protocol === "http:" && isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new OriginConfigurationError("ORIGIN_BASE_URL must use HTTPS outside local preview");
  }

  if (url.username || url.password) {
    throw new OriginConfigurationError("ORIGIN_BASE_URL must not contain credentials");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new OriginConfigurationError("ORIGIN_BASE_URL must be an origin without path, query, or hash");
  }

  return url;
}

function parseContactUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "mailto:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveConfig(env = {}) {
  return {
    originBaseUrl: parseOriginBaseUrl(env.ORIGIN_BASE_URL),
    originTimeoutMs: parseBoundedInteger(
      env.ORIGIN_TIMEOUT_MS,
      DEFAULT_ORIGIN_TIMEOUT_MS,
      MIN_ORIGIN_TIMEOUT_MS,
      MAX_ORIGIN_TIMEOUT_MS,
    ),
    retryAfterSeconds: parseBoundedInteger(
      env.RETRY_AFTER_SECONDS,
      DEFAULT_RETRY_AFTER_SECONDS,
      1,
      MAX_RETRY_AFTER_SECONDS,
    ),
    contactUrl: parseContactUrl(env.CONTACT_URL),
  };
}

function resolveResponseConfig(env = {}) {
  return {
    retryAfterSeconds: parseBoundedInteger(
      env.RETRY_AFTER_SECONDS,
      DEFAULT_RETRY_AFTER_SECONDS,
      1,
      MAX_RETRY_AFTER_SECONDS,
    ),
    contactUrl: parseContactUrl(env.CONTACT_URL),
  };
}

function hasPathPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNonDocumentPath(pathname) {
  return (
    NON_DOCUMENT_PATHS.has(pathname) ||
    NON_DOCUMENT_PREFIXES.some((prefix) => hasPathPrefix(pathname, prefix)) ||
    STATIC_FILE_EXTENSION.test(pathname)
  );
}

export function explicitlyAcceptsHtml(acceptHeader) {
  if (!acceptHeader) {
    return false;
  }

  return acceptHeader.split(",").some((entry) => {
    const [mediaType, ...parameters] = entry.split(";");
    if (mediaType.trim().toLowerCase() !== "text/html") {
      return false;
    }

    const qualityParameter = parameters.find((parameter) => /^q\s*=/i.test(parameter.trim()));
    if (!qualityParameter) {
      return true;
    }

    const quality = Number.parseFloat(qualityParameter.slice(qualityParameter.indexOf("=") + 1));
    return Number.isFinite(quality) && quality > 0;
  });
}

export function isHtmlDocumentRequest(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const url = new URL(request.url);
  return !isNonDocumentPath(url.pathname) && explicitlyAcceptsHtml(request.headers.get("accept"));
}

function assertNoObviousRecursion(requestUrl, originBaseUrl) {
  const sameHostname = requestUrl.hostname.toLowerCase() === originBaseUrl.hostname.toLowerCase();
  const localDifferentPorts =
    sameHostname &&
    isLoopbackHostname(requestUrl.hostname) &&
    requestUrl.port !== originBaseUrl.port;

  if (sameHostname && !localDifferentPorts) {
    throw new OriginConfigurationError(
      "ORIGIN_BASE_URL must use the provider origin hostname, not the public Worker hostname",
    );
  }
}

export function buildOriginRequest(request, originBaseUrl) {
  const requestUrl = new URL(request.url);
  if (request.headers.get(EDGE_HOP_HEADER) === EDGE_HOP_VALUE) {
    throw new OriginConfigurationError("Worker recursion guard rejected a repeated edge hop");
  }

  assertNoObviousRecursion(requestUrl, originBaseUrl);

  const originUrl = new URL(originBaseUrl.toString());
  originUrl.pathname = requestUrl.pathname;
  originUrl.search = requestUrl.search;

  const originRequest = new Request(originUrl.toString(), request);
  originRequest.headers.delete("host");
  originRequest.headers.set("X-Forwarded-Host", requestUrl.host);
  originRequest.headers.set("X-Forwarded-Proto", requestUrl.protocol.slice(0, -1));
  originRequest.headers.set(EDGE_HOP_HEADER, EDGE_HOP_VALUE);
  return originRequest;
}

async function fetchWithTimeout(originRequest, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort("origin-timeout");
      reject(new OriginUnavailableError("timeout"));
    }, timeoutMs);
  });

  const originFetch = Promise.resolve()
    .then(() => fetchImpl(originRequest, { signal: controller.signal }))
    .catch(() => {
      throw new OriginUnavailableError(controller.signal.aborted ? "timeout" : "network");
    });

  try {
    return await Promise.race([originFetch, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function escapeHtmlAttribute(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

export function renderMaintenancePage(contactUrl = null) {
  const contactAction = contactUrl
    ? `<a class="action action-secondary" href="${escapeHtmlAttribute(contactUrl)}" rel="noreferrer">聯絡我們</a>`
    : "";

  return `<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="color-scheme" content="light">
  <title>服務暫時無法使用</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1d1a16;
      background: #eee6d8;
    }

    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      min-inline-size: 0;
      background:
        radial-gradient(circle at 20% 0%, rgba(255, 253, 250, 0.95), transparent 42rem),
        linear-gradient(155deg, #fffdfa 0%, #f4efe5 54%, #eee6d8 100%);
    }

    main {
      display: grid;
      place-items: center;
      min-block-size: 100vh;
      min-block-size: 100dvb;
      padding-block: max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-bottom));
      padding-inline: max(1rem, env(safe-area-inset-left)) max(1rem, env(safe-area-inset-right));
    }

    .panel {
      inline-size: min(100%, 42rem);
      padding: clamp(1.5rem, 5vw, 3.5rem);
      overflow-wrap: anywhere;
      background: rgba(255, 253, 250, 0.94);
      border: 1px solid #ded7ca;
      border-radius: clamp(1rem, 3vw, 1.5rem);
      box-shadow: 0 24px 70px -48px rgba(26, 20, 12, 0.58);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      margin-block-end: clamp(2.5rem, 8vw, 4.5rem);
      color: #15130f;
      font-size: 1rem;
      font-weight: 750;
      letter-spacing: -0.02em;
    }

    .brand-mark {
      display: grid;
      place-items: center;
      inline-size: 1.9rem;
      block-size: 1.9rem;
      border-radius: 0.55rem;
      color: #fffdfa;
      background: #0f766e;
      font-size: 0.82rem;
      line-height: 1;
    }

    .eyebrow {
      margin: 0 0 0.75rem;
      color: #0f766e;
      font-size: 0.78rem;
      font-weight: 750;
      letter-spacing: 0.12em;
    }

    h1 {
      max-inline-size: 14ch;
      margin: 0;
      color: #15130f;
      font-size: clamp(2rem, 8vw, 3.75rem);
      font-weight: 760;
      line-height: 1.08;
      letter-spacing: -0.045em;
      text-wrap: balance;
    }

    .message {
      max-inline-size: 34rem;
      margin: 1.25rem 0 0;
      color: #5f574c;
      font-size: clamp(1rem, 2.8vw, 1.1rem);
      line-height: 1.75;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-block-start: 2rem;
    }

    .action {
      display: inline-flex;
      min-block-size: 2.8rem;
      align-items: center;
      justify-content: center;
      padding: 0.7rem 1.1rem;
      border: 1px solid transparent;
      border-radius: 0.65rem;
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.2;
      text-decoration: none;
    }

    .action-primary { color: #fffdfa; background: #15130f; }
    .action-primary:hover { background: #2b2721; }
    .action-secondary { color: #1d1a16; background: transparent; border-color: #c9c0b2; }
    .action-secondary:hover { background: #f4efe5; }

    .action:focus-visible {
      outline: 3px solid #0f766e;
      outline-offset: 3px;
    }

    .note {
      margin: 1.25rem 0 0;
      color: #6b6258;
      font-size: 0.82rem;
      line-height: 1.6;
    }

    @media (max-width: 26rem) {
      .actions { flex-direction: column; }
      .action { inline-size: 100%; }
    }

    @media (forced-colors: active) {
      .panel, .action { border: 1px solid CanvasText; }
      .brand-mark, .action-primary { background: ButtonText; color: ButtonFace; }
    }
  </style>
</head>
<body>
  <main>
    <section class="panel" aria-labelledby="maintenance-title">
      <div class="brand" aria-label="網站服務狀態">
        <span class="brand-mark" aria-hidden="true">!</span>
        <span>網站服務</span>
      </div>
      <p class="eyebrow">目前無法連線</p>
      <h1 id="maintenance-title">網站暫時無法連線</h1>
      <p class="message">我們正在處理。你可以先休息一下，過幾分鐘再重新整理。</p>
      <div class="actions">
        <a class="action action-primary" href="">重新整理</a>
        ${contactAction}
      </div>
      <p class="note">如果你剛完成付款或送出資料，先別重複操作，等服務恢復後再確認一次。</p>
    </section>
  </main>
</body>
</html>`;
}

function sharedUnavailableHeaders(config) {
  return {
    "Cache-Control": "no-store",
    "Retry-After": String(config.retryAfterSeconds),
    "X-Content-Type-Options": "nosniff",
  };
}

function resolveRequestId(request) {
  const incoming = request.headers.get("x-request-id");
  if (incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function createMaintenanceResponse(request, config) {
  const headers = new Headers({
    ...sharedUnavailableHeaders(config),
    "Content-Language": "zh-TW",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    Vary: "Accept",
    "X-CabAI-Fallback": "maintenance",
  });

  const body = request.method === "HEAD" ? null : renderMaintenancePage(config.contactUrl);
  return new Response(body, { status: 503, headers });
}

function createOriginUnavailableResponse(request, config) {
  const url = new URL(request.url);
  const apiRequest = hasPathPrefix(url.pathname, "/api");
  const requestId = resolveRequestId(request);
  const headers = new Headers(sharedUnavailableHeaders(config));
  headers.set("Content-Language", "zh-TW");
  headers.set("X-Request-ID", requestId);

  let body = null;
  if (apiRequest) {
    headers.set("Content-Type", "application/json; charset=utf-8");
    if (request.method !== "HEAD") {
      body = JSON.stringify({
        error: "服務暫時無法使用，請稍後再試。",
        code: "ORIGIN_UNAVAILABLE",
        requestId,
      });
    }
  } else {
    headers.set("Content-Type", "text/plain; charset=utf-8");
    if (request.method !== "HEAD") {
      body = "服務暫時無法使用，請稍後再試。";
    }
  }

  return new Response(body, { status: 503, headers });
}

export async function handleRequest(request, env = {}, runtime = {}) {
  const fetchImpl = runtime.fetch ?? globalThis.fetch;
  const renderFallback = runtime.renderMaintenance ?? createMaintenanceResponse;
  let config;
  let originRequest;

  try {
    config = resolveConfig(env);
    originRequest = buildOriginRequest(request, config.originBaseUrl);
  } catch {
    const responseConfig = resolveResponseConfig(env);
    const response = isHtmlDocumentRequest(request)
      ? createMaintenanceResponse(request, responseConfig)
      : createOriginUnavailableResponse(request, responseConfig);
    return withOriginFailureDiagnostic(response, "configuration");
  }

  let originResponse;
  try {
    originResponse = await fetchWithTimeout(originRequest, fetchImpl, config.originTimeoutMs);
  } catch (error) {
    const response = isHtmlDocumentRequest(request)
      ? createMaintenanceResponse(request, config)
      : createOriginUnavailableResponse(request, config);
    const reason = error instanceof OriginUnavailableError ? error.kind : "network";
    return withOriginFailureDiagnostic(response, reason);
  }

  try {
    const cloudflareTransportFailure =
      originResponse.status >= CLOUDFLARE_TRANSPORT_STATUS_MIN &&
      originResponse.status <= CLOUDFLARE_TRANSPORT_STATUS_MAX;
    if (cloudflareTransportFailure) {
      const response = isHtmlDocumentRequest(request)
        ? renderFallback(request, config)
        : createOriginUnavailableResponse(request, config);
      return withOriginFailureDiagnostic(response, "transport", originResponse.status);
    }
    if (isHtmlDocumentRequest(request) && MAINTENANCE_STATUS_CODES.has(originResponse.status)) {
      return withOriginFailureDiagnostic(
        renderFallback(request, config),
        "origin-status",
        originResponse.status,
      );
    }
  } catch {
    // The origin has already answered. If fallback rendering itself fails, keep
    // the original non-2xx response instead of retrying a possibly-mutating request.
    return originResponse.status >= 500
      ? withOriginFailureDiagnostic(originResponse, "origin-status", originResponse.status)
      : originResponse;
  }

  return originResponse.status >= 500
    ? withOriginFailureDiagnostic(originResponse, "origin-status", originResponse.status)
    : originResponse;
}

function queueMonitorAlarmBootstrap(env, context) {
  if (!context?.waitUntil || env.MONITORING_ENABLED?.trim().toLowerCase() !== "true") return;

  const now = Date.now();
  if (now < monitorAlarmBootstrapAfter) return;
  monitorAlarmBootstrapAfter = now + MONITOR_ALARM_BOOTSTRAP_COOLDOWN_MS;

  context.waitUntil(ensureMonitorAlarm(env).catch(() => {
    monitorAlarmBootstrapAfter = Date.now() + MONITOR_ALARM_BOOTSTRAP_RETRY_MS;
    console.error(JSON.stringify({ event: "cabai.monitor.alarm-bootstrap", status: "failed" }));
    throw new Error("Monitor alarm bootstrap failed");
  }));
}

const worker = {
  async fetch(request, env, context) {
    const response = await handleRequest(request, env);
    queueMonitorAlarmBootstrap(env, context);
    if (context?.waitUntil && response.status >= 500) {
      const diagnostic = originFailureDiagnostics.get(response) ?? { reason: "unknown", originStatus: null };
      context.waitUntil(queueOriginFailure(env, request, response, diagnostic));
    }
    return response;
  },
  scheduled(_controller, env, context) {
    context.waitUntil(triggerScheduledMonitor(env));
  },
};

export default worker;
