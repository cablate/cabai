const FAILURE_THRESHOLD = 2;
const TRAFFIC_FAILURE_THRESHOLD = 2;
const TRAFFIC_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = 8_000;
const MONITOR_INTERVAL_MS = 60_000;
const MONITOR_DEDUPLICATION_WINDOW_MS = 45_000;
const MONITOR_BOOTSTRAP_DELAY_MS = 1_000;
const MONITOR_RUN_URL = "https://cabai-monitor.internal/run";
const MONITOR_ENSURE_ALARM_URL = "https://cabai-monitor.internal/ensure-alarm";
const ORIGIN_FAILURE_URL = "https://cabai-monitor.internal/origin-failure";
const LAST_CYCLE_AT_KEY = "monitor:last-cycle-at";
const TRAFFIC_FAILURE_REASONS = new Set([
  "configuration",
  "network",
  "timeout",
  "transport",
  "origin-status",
  "unknown",
]);

class MonitorConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MonitorConfigurationError";
  }
}

function monitoringEnabled(env = {}) {
  return env.MONITORING_ENABLED?.trim().toLowerCase() === "true";
}

function requiredString(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new MonitorConfigurationError(`${key} is required when monitoring is enabled`);
  return value;
}

function parseOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MonitorConfigurationError("ORIGIN_BASE_URL must be an absolute HTTPS origin");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new MonitorConfigurationError("ORIGIN_BASE_URL must be an HTTPS origin without credentials or path");
  }
  return url;
}

function monitorLabel(value) {
  const label = value?.trim() || "CabAI 正式站";
  if (label.length > 48 || /[\r\n\u0000-\u001f]/.test(label)) {
    throw new MonitorConfigurationError("MONITOR_LABEL must be a single line of at most 48 characters");
  }
  return label;
}

export function resolveMonitorConfig(env = {}) {
  if (!monitoringEnabled(env)) return null;
  return {
    origin: parseOrigin(requiredString(env, "ORIGIN_BASE_URL")),
    cronSecret: requiredString(env, "CRON_SECRET"),
    discordBotToken: requiredString(env, "DISCORD_BOT_TOKEN"),
    discordChannelId: requiredString(env, "DISCORD_ALERT_CHANNEL_ID"),
    label: monitorLabel(env.MONITOR_LABEL),
  };
}

function stateKey(checkId) {
  return `check:${checkId}`;
}

function safeReason(response, body) {
  const status = Number.isInteger(response?.status) ? `HTTP ${response.status}` : "network error";
  const bodyStatus = typeof body?.status === "string" && /^[a-z_-]{1,32}$/i.test(body.status)
    ? ` / ${body.status}`
    : "";
  return `${status}${bodyStatus}`;
}

async function fetchJsonWithTimeout(url, init, fetchImpl, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("monitor-timeout"), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    let body = null;
    try {
      body = await response.clone().json();
    } catch {
      // A malformed health response is a failed probe; its body is never logged.
    }
    return {
      ok: response.status === 200 && body?.status === "ok",
      reason: safeReason(response, body),
    };
  } catch {
    return { ok: false, reason: "network error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendDiscordMessage(config, content, fetchImpl) {
  const response = await fetchImpl(
    `https://discord.com/api/v10/channels/${encodeURIComponent(config.discordChannelId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${config.discordBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    },
  );
  if (!response.ok) throw new Error(`Discord notification failed with HTTP ${response.status}`);
}

function outageMessage(config, check, result, now) {
  return [
    `🚨 ${config.label}：監控異常`,
    `檢查：${check.label}`,
    `狀態：${result.reason}`,
    `判定：連續 ${FAILURE_THRESHOLD} 次失敗`,
    `時間：${now.toISOString()}`,
  ].join("\n");
}

function recoveryMessage(config, check, now) {
  return [
    `✅ ${config.label}：已恢復`,
    `檢查：${check.label}`,
    `時間：${now.toISOString()}`,
  ].join("\n");
}

async function updateCheck(storage, config, check, result, fetchImpl, now) {
  const key = stateKey(check.id);
  const current = (await storage.get(key)) ?? { consecutiveFailures: 0, incidentOpen: false };

  if (result.ok) {
    if (!current.incidentOpen) {
      await storage.put(key, { consecutiveFailures: 0, incidentOpen: false, checkedAt: now.toISOString() });
      return { check: check.id, status: "ok", notified: false };
    }

    try {
      await sendDiscordMessage(config, recoveryMessage(config, check, now), fetchImpl);
      await storage.put(key, { consecutiveFailures: 0, incidentOpen: false, checkedAt: now.toISOString() });
      return { check: check.id, status: "recovered", notified: true };
    } catch {
      await storage.put(key, { ...current, consecutiveFailures: 0, checkedAt: now.toISOString() });
      return { check: check.id, status: "recovery-notification-failed", notified: false };
    }
  }

  const next = {
    ...current,
    consecutiveFailures: Number.isInteger(current.consecutiveFailures)
      ? current.consecutiveFailures + 1
      : 1,
    lastReason: result.reason,
    checkedAt: now.toISOString(),
  };
  await storage.put(key, next);

  if (next.incidentOpen || next.consecutiveFailures < FAILURE_THRESHOLD) {
    return { check: check.id, status: "failed", notified: false };
  }

  try {
    await sendDiscordMessage(config, outageMessage(config, check, result, now), fetchImpl);
    await storage.put(key, { ...next, incidentOpen: true, openedAt: now.toISOString() });
    return { check: check.id, status: "incident-opened", notified: true };
  } catch {
    return { check: check.id, status: "outage-notification-failed", notified: false };
  }
}

export async function runMonitorCycle(storage, env, runtime = {}) {
  const config = resolveMonitorConfig(env);
  if (!config) return { status: "disabled", checks: [] };

  const fetchImpl = runtime.fetch ?? globalThis.fetch;
  const now = runtime.now?.() ?? new Date();
  const checks = [
    {
      id: "liveness",
      label: "網站存活",
      path: "/api/health",
      headers: { Accept: "application/json" },
    },
    {
      id: "readiness",
      label: "營運就緒",
      path: "/api/health/detailed",
      headers: { Accept: "application/json", Authorization: `Bearer ${config.cronSecret}` },
    },
  ];

  const results = await Promise.all(checks.map(async (check) => {
    const url = new URL(check.path, config.origin);
    const result = await fetchJsonWithTimeout(url, { headers: check.headers }, fetchImpl);
    return updateCheck(storage, config, check, result, fetchImpl, now);
  }));

  return { status: "checked", checks: results };
}

function normalizeTrafficFailure(event = {}) {
  const responseStatus = Number.isInteger(event.status) && event.status >= 500 && event.status <= 599
    ? event.status
    : 500;
  const originStatus = Number.isInteger(event.originStatus)
    && event.originStatus >= 500
    && event.originStatus <= 599
    ? event.originStatus
    : null;
  const reason = TRAFFIC_FAILURE_REASONS.has(event.reason) ? event.reason : "unknown";
  const surface = event.surface === "api" ? "api" : "browser";
  return { responseStatus, originStatus, reason, surface };
}

function trafficFailureReasonLabel(reason) {
  return ({
    configuration: "代理設定錯誤",
    network: "上游網路連線失敗",
    timeout: "上游連線逾時",
    transport: "Cloudflare／上游傳輸錯誤",
    "origin-status": "上游服務回傳 5xx",
    unknown: "尚未分類",
  })[reason];
}

export async function recordOriginFailure(storage, env, event, runtime = {}) {
  const config = resolveMonitorConfig(env);
  if (!config) return { status: "disabled" };

  const fetchImpl = runtime.fetch ?? globalThis.fetch;
  const now = runtime.now?.() ?? new Date();
  const key = "traffic:origin-5xx";
  const current = (await storage.get(key)) ?? {};
  const lastNotifiedAt = current.lastNotifiedAt ? Date.parse(current.lastNotifiedAt) : 0;
  const normalized = normalizeTrafficFailure(event);

  if (
    Number.isFinite(lastNotifiedAt)
    && now.getTime() - lastNotifiedAt >= 0
    && now.getTime() - lastNotifiedAt < REQUEST_FAILURE_COOLDOWN_MS
  ) {
    return {
      status: "cooldown",
      count: Number.isInteger(current.count) ? current.count : 0,
      threshold: TRAFFIC_FAILURE_THRESHOLD,
    };
  }

  const parsedWindowStartedAt = current.windowStartedAt ? Date.parse(current.windowStartedAt) : Number.NaN;
  const elapsedInWindow = now.getTime() - parsedWindowStartedAt;
  const sameWindow = Number.isFinite(parsedWindowStartedAt)
    && elapsedInWindow >= 0
    && elapsedInWindow < TRAFFIC_FAILURE_WINDOW_MS;
  const count = sameWindow && Number.isInteger(current.count) ? current.count + 1 : 1;
  const windowStartedAt = sameWindow ? current.windowStartedAt : now.toISOString();
  const next = {
    ...current,
    windowStartedAt,
    count,
    checkedAt: now.toISOString(),
    responseStatus: normalized.responseStatus,
    originStatus: normalized.originStatus,
    reason: normalized.reason,
    surface: normalized.surface,
  };
  await storage.put(key, next);

  if (count < TRAFFIC_FAILURE_THRESHOLD) {
    return { status: "recorded", count, threshold: TRAFFIC_FAILURE_THRESHOLD };
  }

  const surfaceLabel = normalized.surface === "api" ? "API" : "網頁";
  const originStatusLine = normalized.originStatus
    ? `最近上游：HTTP ${normalized.originStatus}`
    : "最近上游：未取得 HTTP 回應";
  const message = [
    `🟡 ${config.label}：短時間內重複偵測到流量異常`,
    "判定：尚未判定整站中斷",
    `最近介面：${surfaceLabel}`,
    `最近回應：HTTP ${normalized.responseStatus}`,
    originStatusLine,
    `原因：${trafficFailureReasonLabel(normalized.reason)}`,
    `次數：${count} 次 / ${TRAFFIC_FAILURE_WINDOW_MS / 60_000} 分鐘`,
    "說明：正式 incident 仍以網站存活／營運就緒連續失敗為準；請查看 Zeabur runtime 紀錄。",
    `時間：${now.toISOString()}`,
  ].join("\n");

  try {
    await sendDiscordMessage(config, message, fetchImpl);
    await storage.put(key, {
      ...next,
      lastNotifiedAt: now.toISOString(),
      windowStartedAt: null,
      count: 0,
    });
    return { status: "notified", count, threshold: TRAFFIC_FAILURE_THRESHOLD };
  } catch {
    return { status: "notification-failed", count, threshold: TRAFFIC_FAILURE_THRESHOLD };
  }
}

export async function triggerScheduledMonitor(env) {
  if (!monitoringEnabled(env)) return;
  if (!env.MONITOR_STATE) throw new MonitorConfigurationError("MONITOR_STATE binding is required");
  const id = env.MONITOR_STATE.idFromName("cabai-production");
  const response = await env.MONITOR_STATE.get(id).fetch(MONITOR_RUN_URL, { method: "POST" });
  if (!response.ok) throw new Error(`Scheduled monitor failed with HTTP ${response.status}`);
}

export async function ensureMonitorAlarm(env) {
  if (!monitoringEnabled(env)) return;
  if (!env.MONITOR_STATE) throw new MonitorConfigurationError("MONITOR_STATE binding is required");
  const id = env.MONITOR_STATE.idFromName("cabai-production");
  const response = await env.MONITOR_STATE.get(id).fetch(MONITOR_ENSURE_ALARM_URL, { method: "POST" });
  if (!response.ok) throw new Error(`Monitor alarm bootstrap failed with HTTP ${response.status}`);
}

export async function queueOriginFailure(env, request, response, diagnostic = {}) {
  if (!monitoringEnabled(env) || !env.MONITOR_STATE || response.status < 500 || response.status > 599) return;
  const id = env.MONITOR_STATE.idFromName("cabai-production");
  const surface = new URL(request.url).pathname.startsWith("/api") ? "api" : "browser";
  const event = normalizeTrafficFailure({
    status: response.status,
    originStatus: diagnostic.originStatus,
    reason: diagnostic.reason,
    surface,
  });
  const notification = await env.MONITOR_STATE.get(id).fetch(ORIGIN_FAILURE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: event.responseStatus,
      originStatus: event.originStatus,
      reason: event.reason,
      surface: event.surface,
    }),
  });
  if (!notification.ok) throw new Error(`Origin failure notification failed with HTTP ${notification.status}`);
}

export class CabaiMonitorState {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
  }

  async ensureAlarm(delayMs = MONITOR_BOOTSTRAP_DELAY_MS) {
    if (!monitoringEnabled(this.env)) return { status: "disabled" };
    if (typeof this.storage.getAlarm !== "function" || typeof this.storage.setAlarm !== "function") {
      throw new MonitorConfigurationError("Durable Object alarm storage is required");
    }

    const now = Date.now();
    const currentAlarm = await this.storage.getAlarm();
    if (
      Number.isFinite(currentAlarm)
      && currentAlarm > now
      && currentAlarm <= now + (2 * MONITOR_INTERVAL_MS)
    ) {
      return { status: "already-armed" };
    }

    await this.storage.setAlarm(now + delayMs);
    return { status: "armed" };
  }

  async runCycle() {
    const now = Date.now();
    const lastCycleAt = await this.storage.get(LAST_CYCLE_AT_KEY);
    if (Number.isFinite(lastCycleAt) && now - lastCycleAt < MONITOR_DEDUPLICATION_WINDOW_MS) {
      return { status: "skipped", checks: [] };
    }

    await this.storage.put(LAST_CYCLE_AT_KEY, now);
    return runMonitorCycle(this.storage, this.env);
  }

  logCycle(result) {
    const notificationFailed = result.checks.some((check) => check.status.endsWith("notification-failed"));
    const receipt = {
      event: "cabai.monitor.cycle",
      status: notificationFailed ? "notification-failed" : result.status,
      checks: result.checks.map((check) => ({ check: check.check, status: check.status })),
    };
    (notificationFailed ? console.error : console.log)(JSON.stringify(receipt));
    return notificationFailed;
  }

  async runAndLogCycle() {
    const result = await this.runCycle();
    const notificationFailed = this.logCycle(result);
    return { result, notificationFailed };
  }

  async alarm() {
    if (!monitoringEnabled(this.env)) return;
    try {
      const { notificationFailed } = await this.runAndLogCycle();
      if (notificationFailed) throw new Error("Monitor notification failed");
    } finally {
      await this.storage.setAlarm(Date.now() + MONITOR_INTERVAL_MS);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    if (url.pathname === "/ensure-alarm") {
      const result = await this.ensureAlarm();
      return Response.json(result);
    }

    if (url.pathname === "/run") {
      try {
        const { result, notificationFailed } = await this.runAndLogCycle();
        return Response.json(result, { status: notificationFailed ? 502 : 200 });
      } finally {
        await this.ensureAlarm(MONITOR_INTERVAL_MS);
      }
    }

    if (url.pathname === "/origin-failure") {
      let event = {};
      try {
        event = await request.json();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      const normalized = normalizeTrafficFailure(event);
      const result = await recordOriginFailure(this.storage, this.env, event);
      const notificationFailed = result.status === "notification-failed";
      const receipt = {
        event: "cabai.monitor.origin-5xx",
        status: result.status,
        responseStatus: normalized.responseStatus,
        originStatus: normalized.originStatus,
        reason: normalized.reason,
        surface: normalized.surface,
        count: Number.isInteger(result.count) ? result.count : 0,
      };
      (notificationFailed ? console.error : console.log)(JSON.stringify(receipt));
      return Response.json(result, { status: notificationFailed ? 502 : 200 });
    }

    return new Response("Not Found", { status: 404 });
  }
}
