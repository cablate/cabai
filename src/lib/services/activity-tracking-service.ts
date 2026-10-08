import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventsRaw, users } from "@/lib/db/schema";
import type { EventSource } from "@/lib/event-tracking";

export async function recordActivity(input: {
  userId: string;
  eventType: string;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
  source?: EventSource;
}): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date();
  await db.transaction(async (tx) => {
    await tx.insert(eventsRaw).values({
      userId: input.userId,
      eventType: input.eventType,
      properties: input.properties ?? {},
      occurredAt,
      source: input.source ?? "web",
    });
    await tx.update(users).set({ lastActiveAt: occurredAt }).where(eq(users.id, input.userId));
  });
}
