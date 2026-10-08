import { count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlementOutbox, orders, webhookLogs } from "@/lib/db/schema";

export type HealthSignalStatus = "ok" | "unknown";

export type HealthSignal<T> = {
  status: HealthSignalStatus;
  value: T | null;
  observedAt: Date;
  errorClass?: string;
};

export type SystemHealthProbes = {
  database: () => Promise<"healthy">;
  pendingWebhookLogs: () => Promise<number>;
  failedWebhookLogs: () => Promise<number>;
  pendingEntitlementTransitions: () => Promise<number>;
  failedEntitlementTransitions: () => Promise<number>;
  lastWebhookTime: () => Promise<Date | null>;
  oldPendingOrders: () => Promise<number>;
};

export type SystemHealthSnapshot = {
  observedAt: Date;
  status: "ok" | "degraded" | "unknown";
  signals: {
    database: HealthSignal<"healthy">;
    pendingWebhookLogs: HealthSignal<number>;
    failedWebhookLogs: HealthSignal<number>;
    pendingEntitlementTransitions: HealthSignal<number>;
    failedEntitlementTransitions: HealthSignal<number>;
    lastWebhookTime: HealthSignal<Date | null>;
    oldPendingOrders: HealthSignal<number>;
  };
  environment: {
    nodeEnv: string;
    databaseConfigured: boolean;
  };
};

const defaultProbes: SystemHealthProbes = {
  async database() {
    await db.execute(sql`SELECT 1`);
    return "healthy";
  },
  async pendingWebhookLogs() {
    const [row] = await db.select({ total: count() }).from(webhookLogs).where(eq(webhookLogs.status, "pending"));
    return row?.total ?? 0;
  },
  async failedWebhookLogs() {
    const [row] = await db.select({ total: count() }).from(webhookLogs).where(eq(webhookLogs.status, "dead_letter"));
    return row?.total ?? 0;
  },
  async pendingEntitlementTransitions() {
    const [row] = await db.select({ total: count() }).from(entitlementOutbox).where(eq(entitlementOutbox.status, "pending"));
    return row?.total ?? 0;
  },
  async failedEntitlementTransitions() {
    const [row] = await db.select({ total: count() }).from(entitlementOutbox).where(eq(entitlementOutbox.status, "dead_letter"));
    return row?.total ?? 0;
  },
  async lastWebhookTime() {
    const [row] = await db.select({ createdAt: webhookLogs.createdAt }).from(webhookLogs).orderBy(sql`${webhookLogs.createdAt} DESC`).limit(1);
    return row?.createdAt ?? null;
  },
  async oldPendingOrders() {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db.select({ total: count() }).from(orders).where(sql`${orders.status} = 'pending' AND ${orders.createdAt} < ${cutoff24h}`);
    return row?.total ?? 0;
  },
};

async function captureSignal<T>(probe: () => Promise<T>, now: () => Date): Promise<HealthSignal<T>> {
  try {
    return { status: "ok", value: await probe(), observedAt: now() };
  } catch (error) {
    return {
      status: "unknown",
      value: null,
      observedAt: now(),
      // Expose a stable class, not a raw database/provider message that may
      // contain connection details or other sensitive context.
      errorClass: error instanceof Error && error.name ? error.name : "UnknownError",
    };
  }
}

export async function getSystemHealthSnapshot(options: {
  probes?: SystemHealthProbes;
  now?: () => Date;
  nodeEnv?: string;
  databaseConfigured?: boolean;
} = {}): Promise<SystemHealthSnapshot> {
  const probes = options.probes ?? defaultProbes;
  const now = options.now ?? (() => new Date());
  const observedAt = now();

  const [database, pendingWebhookLogs, failedWebhookLogs, pendingEntitlementTransitions, failedEntitlementTransitions, lastWebhookTime, oldPendingOrders] = await Promise.all([
    captureSignal(probes.database, now),
    captureSignal(probes.pendingWebhookLogs, now),
    captureSignal(probes.failedWebhookLogs, now),
    captureSignal(probes.pendingEntitlementTransitions, now),
    captureSignal(probes.failedEntitlementTransitions, now),
    captureSignal(probes.lastWebhookTime, now),
    captureSignal(probes.oldPendingOrders, now),
  ]);

  const signals = { database, pendingWebhookLogs, failedWebhookLogs, pendingEntitlementTransitions, failedEntitlementTransitions, lastWebhookTime, oldPendingOrders };
  const knownCount = Object.values(signals).filter((signal) => signal.status === "ok").length;

  return {
    observedAt,
    status: knownCount === 0 ? "unknown" : knownCount === Object.keys(signals).length ? "ok" : "degraded",
    signals,
    environment: {
      nodeEnv: options.nodeEnv ?? process.env.NODE_ENV ?? "unknown",
      databaseConfigured: options.databaseConfigured ?? Boolean(process.env.DATABASE_URL),
    },
  };
}

export function combineCountSignals(signals: Array<HealthSignal<number>>): HealthSignal<number> {
  const observedAt = signals.reduce((latest, signal) => signal.observedAt > latest ? signal.observedAt : latest, signals[0]?.observedAt ?? new Date(0));
  const unavailable = signals.filter((signal) => signal.status !== "ok");
  if (unavailable.length > 0) {
    return {
      status: "unknown",
      value: null,
      observedAt,
      errorClass: unavailable.map((signal) => signal.errorClass ?? "Unavailable").join("+"),
    };
  }
  return { status: "ok", value: signals.reduce((total, signal) => total + (signal.value ?? 0), 0), observedAt };
}
