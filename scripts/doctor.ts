#!/usr/bin/env node

import { Client } from "pg";
import { hasDeploymentConfigErrors, inspectPlatformConfig } from "../src/lib/config/platform";

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const inspection = inspectPlatformConfig();
  const checks: Array<{ name: string; status: "pass" | "fail" | "skip"; message: string }> = [];

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || inspection.diagnostics.some((diagnostic) => diagnostic.key === "DATABASE_URL")) {
    checks.push({ name: "database", status: "skip", message: "Database check skipped until DATABASE_URL is valid." });
  } else {
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      const tables = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'orders', 'plans', 'user_purchases')
      ORDER BY table_name
    `);
      const missing = ["orders", "plans", "user_purchases", "users"].filter(
        (table) => !tables.rows.some((row) => row.table_name === table),
      );
      checks.push({
        name: "database",
        status: missing.length > 0 ? "fail" : "pass",
        message: missing.length > 0 ? `Missing required tables: ${missing.join(", ")}.` : "PostgreSQL and required tables are ready.",
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
      checks.push({ name: "database", status: "fail", message: `Database connection failed (code: ${code}).` });
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const report = {
    ok: !hasDeploymentConfigErrors(inspection) && !checks.some((check) => check.status === "fail"),
    diagnostics: inspection.diagnostics,
    capabilities: inspection.capabilities,
    checks,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Platform doctor");
    for (const diagnostic of report.diagnostics) {
      console.log(`${diagnostic.level.toUpperCase()} ${diagnostic.key}: ${diagnostic.message}`);
    }
    for (const [name, capability] of Object.entries(report.capabilities)) {
      console.log(`${capability.state.toUpperCase()} ${name}: ${capability.provider ?? "built-in"}${capability.missing.length ? ` (missing ${capability.missing.join(", ")})` : ""}`);
    }
    for (const check of checks) console.log(`${check.status.toUpperCase()} ${check.name}: ${check.message}`);
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch(() => {
  console.error("Platform doctor failed unexpectedly.");
  process.exit(1);
});
