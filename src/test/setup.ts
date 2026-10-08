import { config } from "dotenv";

export function loadTestEnvironment(): void {
  config({ path: ".env.test", quiet: true });
  config({ quiet: true });
}

export function requireTestDatabaseUrl(
  environment: Record<string, string | undefined> = process.env,
  connectedUrl?: string,
): string {
  const dbUrl = environment.DATABASE_URL?.trim() ?? "";

  if (!dbUrl) {
    throw new Error("DATABASE_URL not set. Create .env.test for testing.");
  }

  let target: URL;
  try {
    target = new URL(dbUrl);
  } catch {
    throw new Error("Safety: DATABASE_URL must be a valid PostgreSQL URL.");
  }

  // Query parameters can override connection host/database in node-postgres.
  // Do not allow a nominally local URL to redirect destructive test operations.
  const database = target.pathname.slice(1);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || target.search || target.hash
    || !/^[a-zA-Z0-9_]+_test$/.test(database)) {
    throw new Error("Safety: use a loopback PostgreSQL database ending in _test, without URL query/fragment overrides.");
  }
  if (environment.TEST_DATABASE_RESET_CONFIRM !== database) {
    throw new Error("Safety: set TEST_DATABASE_RESET_CONFIRM to the exact disposable database name after verifying its ownership. Tests delete data.");
  }
  if (connectedUrl !== undefined && connectedUrl !== dbUrl) {
    throw new Error("Safety: the initialized database pool does not match the guarded test URL. Restart with the correct environment.");
  }

  return dbUrl;
}
