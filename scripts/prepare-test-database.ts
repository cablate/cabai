import {
  loadTestEnvironment,
  requireTestDatabaseUrl,
} from "../src/test/setup";
import { syncTestDatabase } from "../src/test/database-setup";

async function main(): Promise<void> {
  loadTestEnvironment();
  const databaseUrl = requireTestDatabaseUrl();

  await syncTestDatabase(databaseUrl);
  process.stdout.write("[integration setup] Test database schema is ready.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
