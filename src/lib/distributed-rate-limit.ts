import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitWindows } from "@/lib/db/schema";

export type DistributedRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  resetAt: Date;
};

export async function checkDistributedRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<DistributedRateLimitResult> {
  const now = input.now ?? new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / input.windowMs) * input.windowMs);
  const resetAt = new Date(windowStartedAt.getTime() + input.windowMs);

  const [row] = await db.insert(rateLimitWindows).values({
    key: input.key,
    windowStartedAt,
    count: 1,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: rateLimitWindows.key,
    set: {
      count: sql`CASE WHEN ${rateLimitWindows.windowStartedAt} = ${windowStartedAt} THEN ${rateLimitWindows.count} + 1 ELSE 1 END`,
      windowStartedAt,
      updatedAt: now,
    },
  }).returning({ count: rateLimitWindows.count });

  if (!row) throw new Error("Rate limit counter was not persisted");
  return {
    allowed: row.count <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - row.count),
    retryAfterMs: Math.max(0, resetAt.getTime() - now.getTime()),
    resetAt,
  };
}
