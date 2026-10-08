import { randomUUID } from "node:crypto";
import { appendFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { renderToStaticMarkup } from "react-dom/server";
import { inArray } from "drizzle-orm";
import AuditPage from "../src/app/admin/audit/page";
import { getAdminOperationsOverview } from "../src/lib/admin-operations";
import { db, dbPool } from "../src/lib/db";
import { auditLogs, eventsRaw, users } from "../src/lib/db/schema";
import { getSystemHealthSnapshot } from "../src/lib/system-health";
import { listTrackingPage } from "../src/lib/services/tracking-query-service";
import { requireTestDatabaseUrl, loadTestEnvironment } from "../src/test/setup";
import { ADMIN_COST_BUDGETS, evaluateAdminCostReport } from "./admin-cost-budgets.mjs";
import { collectRequireAgentMethods, compareRouteParity } from "./agent-route-parity.mjs";

type QueryResult = { rowCount: number | null };
type QueryFunction = (...args: unknown[]) => Promise<QueryResult>;
type Metric = {
  dbQueries: number;
  databaseTimeMs: number;
  serverTimeMs: number;
  payloadBytes: number;
  clientRows: number;
  emailFields?: number;
};

const fixtureSizes = [
  { name: "small", users: 12 },
  { name: "medium", users: 100 },
  { name: "large", users: 500 },
] as const;

async function collectRouteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectRouteFiles(fullPath)
      : entry.name === "route.ts" ? [fullPath] : [];
  }));
  return nested.flat();
}

async function measureAgentParity(root: string) {
  const specPath = path.join(root, "docs", "openapi", "agent-v1.json");
  const spec = JSON.parse(await readFile(specPath, "utf8")) as {
    paths?: Record<string, Record<string, { security?: Array<Record<string, unknown>> }>>;
  };
  const documented = new Set(
    Object.entries(spec.paths ?? {}).flatMap(([apiPath, pathItem]) =>
      Object.entries(pathItem ?? {})
        .filter(([method, operation]) =>
          ["get", "post", "put", "patch", "delete"].includes(method)
          && operation?.security?.some((requirement) => Object.hasOwn(requirement, "agentKey")),
        )
        .map(([method]) => `${method.toUpperCase()} ${apiPath}`),
    ),
  );
  const apiRoot = path.join(root, "src", "app", "api");
  const routeFiles = await collectRouteFiles(apiRoot);
  const routes = await Promise.all(routeFiles.map(async (file) => {
    const relative = path.relative(apiRoot, path.dirname(file)).replaceAll("\\", "/");
    const routeSegments = relative === "." ? "" : relative.replace(/\[([^\]]+)\]/g, "{$1}");
    return {
      apiPath: `/api/${routeSegments}`.replace(/\/$/, ""),
      source: await readFile(file, "utf8"),
    };
  }));
  const implemented = collectRequireAgentMethods(routes) as Set<string>;
  const drift = compareRouteParity(implemented, documented);
  return {
    implemented: implemented.size,
    documented: documented.size,
    undocumented: drift.undocumented.length,
    stale: drift.stale.length,
  };
}

function observeQueries<T>(callback: () => Promise<T>): Promise<{ value: T; dbQueries: number; databaseTimeMs: number; serverTimeMs: number }> {
  const pool = dbPool as unknown as { query: QueryFunction };
  const original = pool.query;
  let dbQueries = 0;
  let databaseTimeMs = 0;
  pool.query = (...args) => {
    const started = performance.now();
    return original.apply(dbPool, args).then((result) => {
      dbQueries += 1;
      databaseTimeMs += performance.now() - started;
      return result;
    }, (error: unknown) => {
      dbQueries += 1;
      databaseTimeMs += performance.now() - started;
      throw error;
    });
  };
  const started = performance.now();
  return callback().then((value) => ({
    value,
    dbQueries,
    databaseTimeMs: Math.round(databaseTimeMs * 100) / 100,
    serverTimeMs: Math.round((performance.now() - started) * 100) / 100,
  })).finally(() => {
    pool.query = original;
  });
}

async function measure<T>(
  callback: () => Promise<T>,
  getPayload: (value: T) => string,
  getRows: (value: T) => number,
  getEmailFields?: (value: T) => number,
): Promise<{ value: T; metric: Metric }> {
  const observed = await observeQueries(callback);
  const payloadBytes = Buffer.byteLength(getPayload(observed.value), "utf8");
  return {
    value: observed.value,
    metric: {
      dbQueries: observed.dbQueries,
      databaseTimeMs: observed.databaseTimeMs,
      serverTimeMs: observed.serverTimeMs,
      payloadBytes,
      clientRows: getRows(observed.value),
      ...(getEmailFields ? { emailFields: getEmailFields(observed.value) } : {}),
    },
  };
}

function auditRenderedRows(html: string): number {
  const tableBody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  return (tableBody.match(/<tr\b/g) ?? []).length;
}

function makeSummary(report: {
  fixtures: Array<{ name: string; workload: { users: number; events: number; auditRows: number }; metrics: Record<string, Metric> }>;
  agentParity: { implemented: number; documented: number; undocumented: number; stale: number };
}): string {
  const lines = [
    "### Admin query and payload cost baseline",
    "",
    "Synthetic test-database workloads only. Payloads contain aggregate metrics; fixture identities and row contents are not emitted.",
    "",
    "| Fixture | Surface | Queries | DB ms | Server ms | Payload bytes | Client rows | Email fields |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const fixture of report.fixtures) {
    for (const [surface, metric] of Object.entries(fixture.metrics)) {
      lines.push(`| ${fixture.name} (${fixture.workload.users} users / ${fixture.workload.events} events / ${fixture.workload.auditRows} audit rows) | ${surface} | ${metric.dbQueries} | ${metric.databaseTimeMs} | ${metric.serverTimeMs} | ${metric.payloadBytes} | ${metric.clientRows} | ${metric.emailFields ?? "-"} |`);
    }
  }
  lines.push(
    "",
    `Agent route/OpenAPI parity: ${report.agentParity.implemented} implemented, ${report.agentParity.documented} documented, ${report.agentParity.undocumented} undocumented, ${report.agentParity.stale} stale.`,
    "",
    `Budgets: overview ≤${ADMIN_COST_BUDGETS.adminOverview.maxDbQueries} queries / ${ADMIN_COST_BUDGETS.adminOverview.maxPayloadBytes} bytes; tracking ≤${ADMIN_COST_BUDGETS.tracking.maxDbQueries} queries / ${ADMIN_COST_BUDGETS.tracking.maxClientRows} rows / ${ADMIN_COST_BUDGETS.tracking.maxEmailFields} email fields; audit ≤${ADMIN_COST_BUDGETS.audit.maxDbQueries} queries / ${ADMIN_COST_BUDGETS.audit.maxClientRows} rows; system health ≤${ADMIN_COST_BUDGETS.systemHealth.maxDbQueries} queries / ${ADMIN_COST_BUDGETS.systemHealth.maxPayloadBytes} bytes; parity drift = 0.`,
  );
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  loadTestEnvironment();
  // This runner writes only randomized synthetic rows to a database whose name includes _test.
  requireTestDatabaseUrl();

  const root = process.cwd();
  const runId = randomUUID();
  const searchToken = runId.slice(0, 12);
  const userIds: string[] = [];
  const auditIds: string[] = [];
  const fixtures: Array<{ name: string; workload: { users: number; events: number; auditRows: number }; metrics: Record<string, Metric> }> = [];

  try {
    for (const fixture of fixtureSizes) {
      const now = new Date();
      const addedUsers = Array.from({ length: fixture.users }, (_, index) => ({
        id: randomUUID(),
        name: `Synthetic ${searchToken} ${fixture.name} ${index}`,
        email: `cost-${searchToken}-${fixture.name}-${index}@example.invalid`,
        role: "member" as const,
        lastActiveAt: new Date(now.getTime() - index * 1_000),
        createdAt: new Date(now.getTime() - (index + 1) * 60_000),
      }));
      const currentIds = addedUsers.map(({ id }) => id);
      userIds.push(...currentIds);
      await db.insert(users).values(addedUsers);

      const addedEvents = addedUsers.flatMap((user, index) => [0, 1].map((offset) => ({
        userId: user.id,
        eventType: offset === 0 ? "page_view" : "product_viewed",
        properties: { path: `/synthetic/${fixture.name}/${index}` },
        source: "web" as const,
        occurredAt: new Date(now.getTime() - index * 1_000 - offset),
        createdAt: new Date(now.getTime() - index * 1_000 - offset),
      })));
      await db.insert(eventsRaw).values(addedEvents);

      const addedAuditRows = addedUsers.map((user) => ({
        id: randomUUID(),
        actorType: "user" as const,
        actorId: user.id,
        action: "update",
        entityType: "synthetic_fixture",
        entityId: user.id,
        changes: { status: { before: "draft", after: "active" } },
        metadata: { title: `Synthetic ${fixture.name}` },
        createdAt: now,
      }));
      auditIds.push(...addedAuditRows.map(({ id }) => id));
      await db.insert(auditLogs).values(addedAuditRows);

      const overview = await measure(
        () => getAdminOperationsOverview(),
        (value) => JSON.stringify(value),
        (value) => value.urgent.length + value.work.length,
      );
      const tracking = await measure(
        () => listTrackingPage({ search: searchToken, pageSize: 20, includeEmail: true, now }),
        (value) => JSON.stringify(value),
        (value) => value.items.length,
        (value) => value.items.filter((row) => Boolean(row.email)).length,
      );
      const audit = await measure(
        async () => renderToStaticMarkup(await AuditPage({ searchParams: Promise.resolve({ page: "1" }) })),
        (value) => value,
        auditRenderedRows,
      );
      const health = await measure(
        () => getSystemHealthSnapshot({ now: () => now, nodeEnv: "test", databaseConfigured: true }),
        (value) => JSON.stringify(value),
        (value) => Object.keys(value.signals).length,
      );

      fixtures.push({
        name: fixture.name,
        workload: {
          users: userIds.length,
          events: userIds.length * 2,
          auditRows: auditIds.length,
        },
        metrics: {
          adminOverview: overview.metric,
          tracking: tracking.metric,
          audit: audit.metric,
          systemHealth: health.metric,
        },
      });
    }

    const agentParity = await measureAgentParity(root);
    const report = { generatedAt: new Date().toISOString(), fixtures, agentParity };
    const failures = evaluateAdminCostReport(report);
    const summary = makeSummary(report);
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
    if (failures.length > 0) {
      process.stderr.write(`\nAdmin cost budget failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
      process.exitCode = 1;
    }
  } finally {
    // Exact fixture ids only. The DB name guard runs before the first write.
    if (auditIds.length > 0) await db.delete(auditLogs).where(inArray(auditLogs.id, auditIds));
    if (userIds.length > 0) {
      await db.delete(eventsRaw).where(inArray(eventsRaw.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await dbPool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Admin cost baseline failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
