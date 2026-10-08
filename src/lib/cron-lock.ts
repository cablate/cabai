import { createLogger } from "@/lib/logger";
import { dbPool } from "@/lib/db";

const logger = createLogger("cron-lock");

export async function withCronLock<T>(
  lockName: string,
  task: () => Promise<T>,
): Promise<{ locked: true; result: T } | { locked: false }> {
  const client = await dbPool.connect();

  try {
    const lockResult = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockName],
    );
    const locked = lockResult.rows[0]?.locked === true;

    if (!locked) {
      logger.info("Skipped cron task because another instance holds the lock", {
        lockName,
      });
      return { locked: false };
    }

    try {
      const result = await task();
      return { locked: true, result };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]);
    }
  } finally {
    client.release();
  }
}
