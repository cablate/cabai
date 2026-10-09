import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";

export async function cleanupExpiredOrders(now = new Date()): Promise<{ expired: number }> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expired = await db
    .update(orders)
    .set({ status: "expired", updatedAt: now })
    // A stored checkout may have been paid while its callback was unavailable.
    // Age alone is not provider evidence that it can no longer complete.
    .where(and(eq(orders.status, "pending"), isNull(orders.portalySessionId), lt(orders.createdAt, cutoff)))
    .returning({ id: orders.id });
  return { expired: expired.length };
}
