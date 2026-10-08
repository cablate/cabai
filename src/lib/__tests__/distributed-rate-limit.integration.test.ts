import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rateLimitWindows } from "@/lib/db/schema";

type WorkerResult = {
  backendPid: number;
  allowed: boolean;
  limit: number;
  remaining: number;
};

function runLimiterWorker(key: string, limit: number, nowMs: number): Promise<WorkerResult> {
  const workerScript = `
    import { dbPool } from "./src/lib/db/index.ts";
    import { checkDistributedRateLimit } from "./src/lib/distributed-rate-limit.ts";
    const [{ pid }] = (await dbPool.query("SELECT pg_backend_pid() AS pid")).rows;
    const result = await checkDistributedRateLimit({
      key: process.env.RATE_LIMIT_TEST_KEY,
      limit: Number(process.env.RATE_LIMIT_TEST_LIMIT),
      windowMs: 60000,
      now: new Date(Number(process.env.RATE_LIMIT_TEST_NOW)),
    });
    process.stdout.write(JSON.stringify({ backendPid: Number(pid), ...result }));
    await dbPool.end();
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", workerScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RATE_LIMIT_TEST_KEY: key,
        RATE_LIMIT_TEST_LIMIT: String(limit),
        RATE_LIMIT_TEST_NOW: String(nowMs),
      },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Rate limiter worker exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as WorkerResult);
      } catch {
        reject(new Error("Rate limiter worker returned invalid output"));
      }
    });
  });
}

describe("distributed upload rate limiter across worker processes", () => {
  let key: string | undefined;

  afterEach(async () => {
    if (key) await db.delete(rateLimitWindows).where(eq(rateLimitWindows.key, key));
    key = undefined;
  });

  it("shares one atomic PostgreSQL quota across independent workers and connections", async () => {
    key = `integration:upload:${randomUUID()}`;
    const workerCount = 8;
    const limit = 3;
    const nowMs = Date.now();
    const results = await Promise.all(
      Array.from({ length: workerCount }, () => runLimiterWorker(key!, limit, nowMs)),
    );

    expect(new Set(results.map((result) => result.backendPid)).size).toBe(workerCount);
    expect(results.filter((result) => result.allowed)).toHaveLength(limit);
    expect(results.filter((result) => !result.allowed)).toHaveLength(workerCount - limit);
    expect(results.every((result) => result.limit === limit && result.remaining >= 0)).toBe(true);
    await expect(db.query.rateLimitWindows.findFirst({ where: eq(rateLimitWindows.key, key) }))
      .resolves.toMatchObject({ count: workerCount });
  }, 45_000);
});
