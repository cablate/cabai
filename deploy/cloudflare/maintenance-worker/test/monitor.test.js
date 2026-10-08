import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CabaiMonitorState,
  recordOriginFailure,
  resolveMonitorConfig,
  runMonitorCycle,
} from "../src/monitor.js";

const ENV = {
  MONITORING_ENABLED: "true",
  ORIGIN_BASE_URL: "https://cabai-origin.example",
  CRON_SECRET: "monitor-cron-secret",
  DISCORD_BOT_TOKEN: "monitor-discord-token",
  DISCORD_ALERT_CHANNEL_ID: "1234567890",
};

class MemoryStorage {
  values = new Map();
  alarmAt = null;

  async get(key) {
    return this.values.get(key);
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }

  async getAlarm() {
    return this.alarmAt;
  }

  async setAlarm(value) {
    this.alarmAt = value instanceof Date ? value.getTime() : value;
  }
}

test("self-host example owns no maintainer route and disables monitoring by default", () => {
  const generic = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const production = JSON.parse(
    readFileSync(new URL("../wrangler.cabai-production.jsonc", import.meta.url), "utf8"),
  );

  assert.equal(production.name, "selfhost-maintenance-example");
  assert.equal(production.main, generic.main);
  assert.deepEqual(production.durable_objects, generic.durable_objects);
  assert.deepEqual(production.migrations, generic.migrations);
  assert.deepEqual(production.triggers, generic.triggers);
  assert.equal("routes" in production, false);
  assert.equal(production.vars.MONITORING_ENABLED, "false");
  assert.equal(production.vars.MONITOR_LABEL, "Self-host monitoring");
  assert.equal(production.vars.CONTACT_URL, "mailto:support@example.com");
  assert.equal("ORIGIN_BASE_URL" in production.vars, false);
  assert.equal(JSON.stringify(production).includes("CRON_SECRET"), false);
  assert.equal(JSON.stringify(production).includes("DISCORD_BOT_TOKEN"), false);
});

function monitorFetch({ liveness = 200, readiness = 200, messages = [] } = {}) {
  return async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === "discord.com") {
      const payload = JSON.parse(init.body);
      messages.push({ payload, authorization: init.headers.Authorization });
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/api/health/detailed") {
      assert.equal(init.headers.Authorization, `Bearer ${ENV.CRON_SECRET}`);
      return Response.json({ status: readiness === 200 ? "ok" : "degraded" }, { status: readiness });
    }
    if (url.pathname === "/api/health") {
      return Response.json({ status: liveness === 200 ? "ok" : "error" }, { status: liveness });
    }
    throw new Error(`Unexpected URL ${url.hostname}${url.pathname}`);
  };
}

test("monitoring is opt-in and enabled configuration requires every secret", () => {
  assert.equal(resolveMonitorConfig({ ...ENV, MONITORING_ENABLED: "false" }), null);
  assert.throws(
    () => resolveMonitorConfig({ ...ENV, DISCORD_BOT_TOKEN: "" }),
    /DISCORD_BOT_TOKEN/,
  );
  assert.throws(() => resolveMonitorConfig({ ...ENV, MONITOR_LABEL: "bad\nlabel" }), /MONITOR_LABEL/);
});

test("monitor label distinguishes a drill from a production incident", async () => {
  const storage = new MemoryStorage();
  const messages = [];
  const env = { ...ENV, MONITOR_LABEL: "CabAI 監控演練" };
  const fetch = monitorFetch({ liveness: 503, messages });

  await runMonitorCycle(storage, env, { fetch, now: () => new Date("2026-07-13T09:00:00Z") });
  await runMonitorCycle(storage, env, { fetch, now: () => new Date("2026-07-13T09:01:00Z") });

  assert.equal(messages.length, 1);
  assert.match(messages[0].payload.content, /CabAI 監控演練：監控異常/);
  assert.doesNotMatch(messages[0].payload.content, /正式站/);
});

test("two consecutive probe failures open one incident and the next success sends one recovery", async () => {
  const storage = new MemoryStorage();
  const messages = [];
  const failedFetch = monitorFetch({ liveness: 503, messages });

  await runMonitorCycle(storage, ENV, { fetch: failedFetch, now: () => new Date("2026-07-13T10:00:00Z") });
  assert.equal(messages.length, 0);

  await runMonitorCycle(storage, ENV, { fetch: failedFetch, now: () => new Date("2026-07-13T10:01:00Z") });
  assert.equal(messages.length, 1);
  assert.match(messages[0].payload.content, /正式站：監控異常/);
  assert.match(messages[0].payload.content, /網站存活/);

  await runMonitorCycle(storage, ENV, { fetch: failedFetch, now: () => new Date("2026-07-13T10:02:00Z") });
  assert.equal(messages.length, 1);

  await runMonitorCycle(storage, ENV, {
    fetch: monitorFetch({ messages }),
    now: () => new Date("2026-07-13T10:03:00Z"),
  });
  assert.equal(messages.length, 2);
  assert.match(messages[1].payload.content, /正式站：已恢復/);

  await runMonitorCycle(storage, ENV, {
    fetch: monitorFetch({ messages }),
    now: () => new Date("2026-07-13T10:04:00Z"),
  });
  assert.equal(messages.length, 2);
});

test("readiness degradation is tracked independently from public liveness", async () => {
  const storage = new MemoryStorage();
  const messages = [];
  const fetch = monitorFetch({ readiness: 503, messages });

  await runMonitorCycle(storage, ENV, { fetch, now: () => new Date("2026-07-13T11:00:00Z") });
  await runMonitorCycle(storage, ENV, { fetch, now: () => new Date("2026-07-13T11:01:00Z") });

  assert.equal(messages.length, 1);
  assert.match(messages[0].payload.content, /營運就緒/);
  assert.doesNotMatch(messages[0].payload.content, new RegExp(ENV.CRON_SECRET));
});

test("Durable Object alarm bootstrap is idempotent and monitor cycles rearm themselves", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const storage = new MemoryStorage();
  const receipts = [];
  let probeCalls = 0;
  const fetch = monitorFetch();
  globalThis.fetch = async (...args) => {
    if (new URL(args[0]).hostname === "cabai-origin.example") probeCalls += 1;
    return fetch(...args);
  };
  console.log = (message) => receipts.push(JSON.parse(message));

  try {
    const monitor = new CabaiMonitorState({ storage }, ENV);
    const first = await monitor.fetch(new Request("https://cabai-monitor.internal/ensure-alarm", {
      method: "POST",
    }));
    const firstAlarmAt = storage.alarmAt;
    const second = await monitor.fetch(new Request("https://cabai-monitor.internal/ensure-alarm", {
      method: "POST",
    }));

    assert.deepEqual(await first.json(), { status: "armed" });
    assert.deepEqual(await second.json(), { status: "already-armed" });
    assert.ok(firstAlarmAt > Date.now());
    assert.equal(storage.alarmAt, firstAlarmAt);

    storage.alarmAt = Date.now() + (10 * 60 * 1000);
    const repaired = await monitor.fetch(new Request("https://cabai-monitor.internal/ensure-alarm", {
      method: "POST",
    }));
    const repairedAlarmAt = storage.alarmAt;
    assert.deepEqual(await repaired.json(), { status: "armed" });
    assert.ok(repairedAlarmAt < Date.now() + (2 * 60 * 1000));

    await monitor.alarm();
    assert.equal(probeCalls, 2);
    assert.ok(storage.alarmAt > repairedAlarmAt);
    assert.equal(receipts[0].event, "cabai.monitor.cycle");
    assert.equal(receipts[0].status, "checked");
    assert.deepEqual(receipts[0].checks, [
      { check: "liveness", status: "ok" },
      { check: "readiness", status: "ok" },
    ]);

    await monitor.alarm();
    assert.equal(probeCalls, 2);
    assert.equal(receipts[1].status, "skipped");
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test("Durable Object alarm surfaces notification failures and still rearms", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const storage = new MemoryStorage();
  const receipts = [];
  await storage.put("check:liveness", { consecutiveFailures: 1, incidentOpen: false });
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === "discord.com") return new Response(null, { status: 503 });
    if (url.pathname === "/api/health") {
      return Response.json({ status: "error" }, { status: 503 });
    }
    if (url.pathname === "/api/health/detailed") {
      return Response.json({ status: "ok" });
    }
    throw new Error(`Unexpected URL ${url.hostname}${url.pathname}`);
  };
  console.error = (message) => receipts.push(JSON.parse(message));

  try {
    const monitor = new CabaiMonitorState({ storage }, ENV);
    await assert.rejects(() => monitor.alarm(), /Monitor notification failed/);
    assert.ok(storage.alarmAt > Date.now());
    assert.deepEqual(receipts, [{
      event: "cabai.monitor.cycle",
      status: "notification-failed",
      checks: [
        { check: "liveness", status: "outage-notification-failed" },
        { check: "readiness", status: "ok" },
      ],
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("traffic 5xx requires two events in five minutes and remains explicitly non-incident", async () => {
  const storage = new MemoryStorage();
  const messages = [];
  const fetch = monitorFetch({ messages });

  const first = await recordOriginFailure(storage, ENV, {
    status: 500,
    originStatus: 500,
    reason: "origin-status",
    surface: "api",
    ignored: "private payload",
  }, {
    fetch,
    now: () => new Date("2026-07-13T12:00:00Z"),
  });
  assert.deepEqual(first, { status: "recorded", count: 1, threshold: 2 });
  assert.equal(messages.length, 0);

  const second = await recordOriginFailure(storage, ENV, {
    status: 503,
    reason: "timeout",
    surface: "browser",
  }, {
    fetch,
    now: () => new Date("2026-07-13T12:01:00Z"),
  });

  assert.deepEqual(second, { status: "notified", count: 2, threshold: 2 });
  assert.equal(messages.length, 1);
  assert.match(messages[0].payload.content, /短時間內重複偵測到流量異常/);
  assert.match(messages[0].payload.content, /尚未判定整站中斷/);
  assert.match(messages[0].payload.content, /最近介面：網頁/);
  assert.match(messages[0].payload.content, /最近回應：HTTP 503/);
  assert.match(messages[0].payload.content, /原因：上游連線逾時/);
  assert.match(messages[0].payload.content, /次數：2 次 \/ 5 分鐘/);
  assert.doesNotMatch(messages[0].payload.content, /Sentry/);
  assert.doesNotMatch(messages[0].payload.content, /private payload/);
  assert.deepEqual(messages[0].payload.allowed_mentions, { parse: [] });

  const cooldown = await recordOriginFailure(storage, ENV, {
    status: 502,
    originStatus: 502,
    reason: "origin-status",
    surface: "browser",
  }, {
    fetch,
    now: () => new Date("2026-07-13T12:06:00Z"),
  });
  assert.equal(cooldown.status, "cooldown");
  assert.equal(messages.length, 1);

  const nextWindow = await recordOriginFailure(storage, ENV, {
    status: 502,
    originStatus: 502,
    reason: "origin-status",
    surface: "browser",
  }, {
    fetch,
    now: () => new Date("2026-07-13T12:12:00Z"),
  });
  assert.deepEqual(nextWindow, { status: "recorded", count: 1, threshold: 2 });
  assert.equal(messages.length, 1);
});

test("Durable Object returns a visible failure when Discord rejects a notification", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  const receipts = [];
  globalThis.fetch = async () => new Response(null, { status: 503 });
  console.log = (message) => receipts.push(JSON.parse(message));
  console.error = (message) => receipts.push(JSON.parse(message));

  try {
    const monitor = new CabaiMonitorState({ storage: new MemoryStorage() }, ENV);
    const first = await monitor.fetch(new Request("https://cabai-monitor.internal/origin-failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: 500, originStatus: 500, reason: "origin-status", surface: "api" }),
    }));
    assert.equal(first.status, 200);

    const response = await monitor.fetch(new Request("https://cabai-monitor.internal/origin-failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: 503, reason: "timeout", surface: "browser" }),
    }));

    assert.equal(response.status, 502);
    assert.deepEqual(receipts, [
      {
        event: "cabai.monitor.origin-5xx",
        status: "recorded",
        responseStatus: 500,
        originStatus: 500,
        reason: "origin-status",
        surface: "api",
        count: 1,
      },
      {
        event: "cabai.monitor.origin-5xx",
        status: "notification-failed",
        responseStatus: 503,
        originStatus: null,
        reason: "timeout",
        surface: "browser",
        count: 2,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }
});
