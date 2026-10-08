import { runListBackups, runScheduledBackup, runVerifyBackup } from "../src/lib/backup";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) return runListBackups();
  const verifyIndex = args.indexOf("--verify");
  if (verifyIndex >= 0) {
    const id = args[verifyIndex + 1];
    if (!id) throw new Error("Usage: npm run db:backup -- --verify <artifact-id>");
    await runVerifyBackup(id);
    console.log(`[backup] verified ${id}`);
    return;
  }
  if (args.includes("--restore")) {
    throw new Error("Unsafe download-only restore was removed. Use npm run db:restore:drill with an explicit isolated target.");
  }
  const result = await runScheduledBackup();
  console.log(`[backup] committed ${result.created}; removed ${result.removed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
