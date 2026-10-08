"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlementOutbox, webhookLogs } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";

/**
 * Reset a dead_letter webhook to pending so it gets retried.
 */
export async function resendWebhook(logId: string) {
  await requireAdminAction("webhook:resend");

  await db
    .update(webhookLogs)
    .set({
      status: "pending",
      attempts: 0,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(webhookLogs.id, logId),
      inArray(webhookLogs.status, ["dead_letter", "failed"]),
    ));

  revalidatePath("/admin/webhooks");

  // The startup recovery scan or next push cycle will pick this up.
  // For immediate retry, we could import and call executePush,
  // but that's not safe in a server action context. Leave it for the background scan.
}

/** Reset a failed domain transition; completed webhook/Discord markers stay intact. */
export async function retryEntitlementTransition(eventId: string) {
  await requireAdminAction("entitlement-transition:retry");

  await db
    .update(entitlementOutbox)
    .set({
      status: "pending",
      attempts: 0,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(entitlementOutbox.id, eventId),
      inArray(entitlementOutbox.status, ["dead_letter", "failed"]),
    ));

  revalidatePath("/admin/webhooks");
}
