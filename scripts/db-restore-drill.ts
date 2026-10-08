import { spawn } from "node:child_process";
import { createBackupSinkFromEnv } from "../src/lib/backup";
import { runRestoreDrill } from "../src/lib/database-backup/restore-drill";

function value(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function runNpm(args: string[], targetUrl: string): Promise<void> {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: "inherit", env: { ...process.env, DATABASE_URL: targetUrl } });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`npm ${args.join(" ")} failed with exit code ${code}`)));
  });
}

async function main() {
  const artifactId = value("--artifact");
  const targetUrl = value("--target-url");
  const confirmTarget = value("--confirm-target");
  if (!artifactId || !targetUrl || !confirmTarget) {
    throw new Error("Usage: npm run db:restore:drill -- --artifact <id> --target-url <url> --confirm-target <db-name>");
  }
  const report = await runRestoreDrill({
    sink: createBackupSinkFromEnv(),
    artifactId,
    targetUrl,
    confirmTarget,
    sourceUrl: process.env.DATABASE_URL,
    writesEnabled: process.env.DB_RESTORE_WRITES_ENABLED === "true",
    allowRemote: process.env.DB_RESTORE_ALLOW_REMOTE_ISOLATED === "true",
  });
  await runNpm(["run", "db:migrate:runtime"], targetUrl);
  await runNpm(["run", "audit:migrations:applied"], targetUrl);
  await runNpm(["run", "doctor", "--", "--json"], targetUrl);
  report.checks.push("forward-migrations", "migration-audit", "doctor");
  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
