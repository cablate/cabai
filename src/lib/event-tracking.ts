import { db } from "@/lib/db";
import { eventsRaw } from "@/lib/db/schema";

export type EventSource =
  | "web"
  | "server"
  | "payment_callback"
  | "marketplace_import";

export interface RecordEventInput {
  userId: string;
  eventType: string;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
  source: EventSource;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  await db.insert(eventsRaw).values({
    userId: input.userId,
    eventType: input.eventType,
    properties: input.properties ?? {},
    occurredAt: input.occurredAt ?? new Date(),
    source: input.source,
  });
}
