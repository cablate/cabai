/**
 * marketplace-processor.ts — Process Portaly marketplace webhook events.
 *
 * Handles: user provisioning, product-plan mapping lookup, order creation,
 * access granting, and refund processing.
 */

import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  orders,
  portalyProductMappings,
  portalyMarketplaceEvents,
} from "@/lib/db/schema";
import { recordEvent } from "@/lib/event-tracking";
import {
  ensurePaymentPurchaseInTransaction,
  revokeOrderEntitlement,
} from "@/lib/entitlement-transitions";
import { createLogger } from "@/lib/logger";
import { maskEmail } from "@/lib/log-redact";

const logger = createLogger("marketplace");

// ─── Types ───

export type ProcessResult = {
  success: boolean;
  status: "processed" | "pending_mapping" | "failed" | "refunded";
  error?: string;
};

type ProcessMarketplaceEventOptions = {
  /** Internal caller assertion: event type was confirmed by an admin-supplied provider export, never stored rawPayload. */
  verifiedImport?: true;
  /**
   * Historical imports from Portaly exports do not include productId.
   * Admin selects the local plan during import, then we still reuse this
   * processor so order and entitlement idempotency stays in one place.
   */
  planIdOverride?: string;
};

// ─── User provisioning ───

/**
 * Find user by email, or create a provisional user (no auth provider).
 * When the user later signs in via Google (same email), Auth.js will
 * link the OAuth account to this existing user record.
 */
async function findOrCreateUser(
  email: string,
  name: string | undefined,
): Promise<string> {
  const normalized = email.toLowerCase().trim();

  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalized),
    columns: { id: true },
  });

  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      email: normalized,
      name: name || null,
      role: "member",
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  // Race condition: another request created this user concurrently
  if (!created) {
    const fallback = await db.query.users.findFirst({
      where: eq(users.email, normalized),
      columns: { id: true },
    });
    if (!fallback) throw new Error(`Failed to find or create user: ${normalized}`);
    return fallback.id;
  }

  logger.info("Created provisional user", { email: maskEmail(normalized), userId: created.id });
  return created.id;
}

// ─── Event processing ───

/**
 * Process a single marketplace event. Called immediately on webhook receipt,
 * and also by batch processing when a new mapping is created.
 */
export async function processMarketplaceEvent(
  eventId: string,
  options: ProcessMarketplaceEventOptions = {},
): Promise<ProcessResult> {
  const event = await db.query.portalyMarketplaceEvents.findFirst({
    where: eq(portalyMarketplaceEvents.id, eventId),
  });

  if (!event) return { success: false, status: "failed", error: "Event not found" };

  // Already processed
  if (event.status === "processed" || event.status === "refunded") {
    return { success: true, status: event.status as "processed" | "refunded" };
  }

  // Stored legacy events also have unauthenticated event/timestamp fields.
  // Mapping creation and generic retries must not turn them into trusted input.
  if (options.verifiedImport !== true) {
    return { success: false, status: "failed", error: "Legacy event is quarantined; reconcile with an authenticated provider export before processing." };
  }

  // Handle refund events
  if (event.event === "refund") {
    return processRefund(event);
  }

  // Look up product-plan mapping unless an admin import supplied the plan.
  const mapping = options.planIdOverride
    ? { planId: options.planIdOverride }
    : await db.query.portalyProductMappings.findFirst({
        where: eq(portalyProductMappings.portalyProductId, event.portalyProductId),
      });

  if (!mapping?.planId) {
    await db
      .update(portalyMarketplaceEvents)
      .set({ status: "pending_mapping" })
      .where(eq(portalyMarketplaceEvents.id, eventId));
    return { success: false, status: "pending_mapping" };
  }

  try {
    // Find or create user
    const userId = await findOrCreateUser(event.customerEmail, event.customerName ?? undefined);

    // Create order + purchase in transaction
    const merchantOrderNumber = `mkt-${event.portalyOrderId}`;

    const result = await db.transaction(async (tx) => {
      // Create order
      const [order] = await tx
        .insert(orders)
        .values({
          userId,
          planId: mapping.planId,
          merchantOrderNumber,
          status: "completed",
          paidAmount: event.amount,
          currency: event.currency,
          paymentMethod: event.paymentMethod,
          callbackPayload: event.rawPayload as Record<string, unknown>,
          createdAt: event.portalyCreatedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: orders.id });

      if (!order) {
        // A duplicate number is not proof of an equivalent payment. Lock the
        // order through the grant so a concurrent refund cannot slip between
        // this check and purchase creation.
        const [existing] = await tx.select({
          id: orders.id,
          userId: orders.userId,
          planId: orders.planId,
          status: orders.status,
          paidAmount: orders.paidAmount,
          currency: orders.currency,
        }).from(orders)
          .where(eq(orders.merchantOrderNumber, merchantOrderNumber))
          .for("update");
        if (!existing || existing.userId !== userId
          || existing.planId !== mapping.planId || existing.status !== "completed"
          || existing.paidAmount !== event.amount || existing.currency !== event.currency) {
          throw new Error("Existing marketplace order does not match the verified payment; reconciliation is required.");
        }
        await ensurePaymentPurchaseInTransaction(tx, {
          userId,
          planId: mapping.planId,
          orderId: existing.id,
          source: "marketplace",
          triggeredBy: "marketplace.paid-replay",
          grantedAt: event.portalyCreatedAt ?? undefined,
        });
        return { orderId: existing.id, created: false };
      }

      await ensurePaymentPurchaseInTransaction(tx, {
        userId,
        planId: mapping.planId,
        orderId: order.id,
        source: "marketplace",
        triggeredBy: "marketplace.paid",
        grantedAt: event.portalyCreatedAt ?? undefined,
      });

      return { orderId: order.id, created: true };
    });

    // Update event status
    await db
      .update(portalyMarketplaceEvents)
      .set({
        status: "processed",
        matchedUserId: userId,
        matchedPlanId: mapping.planId,
        createdOrderId: result.orderId,
        processedAt: new Date(),
      })
      .where(eq(portalyMarketplaceEvents.id, eventId));

    logger.info("Marketplace event processed", {
      eventId,
      userId,
      planId: mapping.planId,
      orderId: result.orderId,
      newOrder: result.created,
    });

    // Track purchase completed (fire-and-forget)
    if (result.created) {
      try {
        await recordEvent({
          userId,
          eventType: "purchase_completed",
          properties: {
            orderId: result.orderId,
            planId: mapping.planId,
            source: "marketplace",
          },
          source: "marketplace_import",
        });
      } catch (trackErr) {
        logger.error("Failed to track purchase_completed", {
          error: String(trackErr),
          eventId,
          userId,
        });
      }
    }

    return { success: true, status: "processed" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to process marketplace event", { eventId, error: errorMsg });

    await db
      .update(portalyMarketplaceEvents)
      .set({ status: "failed", error: errorMsg })
      .where(eq(portalyMarketplaceEvents.id, eventId));

    return { success: false, status: "failed", error: errorMsg };
  }
}

// ─── Refund processing ───

async function processRefund(
  event: typeof portalyMarketplaceEvents.$inferSelect,
): Promise<ProcessResult> {
  // Find the original paid event by looking for an order with matching portalyOrderId
  // Portaly sends refund with the same data.id as the original purchase
  const originalEvent = await db.query.portalyMarketplaceEvents.findFirst({
    where: and(
      eq(portalyMarketplaceEvents.portalyOrderId, event.portalyOrderId),
      eq(portalyMarketplaceEvents.event, "paid"),
    ),
  });

  if (!originalEvent || originalEvent.status !== "processed" || !originalEvent.createdOrderId) {
    const reason = originalEvent
      ? "Refund is waiting for the paid event to finish processing."
      : "Refund has no matching paid event.";
    logger.warn(reason, { portalyOrderId: event.portalyOrderId });
    await db
      .update(portalyMarketplaceEvents)
      .set({ status: "pending", error: reason })
      .where(eq(portalyMarketplaceEvents.id, event.id));
    return { success: false, status: "failed", error: reason };
  }

  await revokeOrderEntitlement({
    orderId: originalEvent.createdOrderId,
    source: "marketplace",
    triggeredBy: "marketplace.refund",
    revokedBy: "marketplace.refund",
    occurredAt: event.portalyCreatedAt ?? undefined,
    orderChanges: {
        status: "refunded",
        refundAmount: event.amount,
        refundedAt: event.portalyCreatedAt ?? new Date(),
    },
  });

  // Update refund event
  await db
    .update(portalyMarketplaceEvents)
    .set({
      status: "refunded",
      matchedUserId: originalEvent.matchedUserId,
      matchedPlanId: originalEvent.matchedPlanId,
      createdOrderId: originalEvent.createdOrderId,
      processedAt: new Date(),
    })
    .where(eq(portalyMarketplaceEvents.id, event.id));

  logger.info("Refund processed", {
    eventId: event.id,
    orderId: originalEvent.createdOrderId,
    userId: originalEvent.matchedUserId,
  });

  return { success: true, status: "refunded" };
}

// ─── Batch processing ───

/**
 * Process every retryable event for a specific Portaly product.
 * Paid events are ordered before their later refund so a previously failed
 * grant cannot be replayed after an already-acknowledged refund.
 */
export async function processPendingForProduct(
  portalyProductId: string,
): Promise<{ total: number; processed: number; failed: number }> {
  const pending = await db.query.portalyMarketplaceEvents.findMany({
    where: and(
      eq(portalyMarketplaceEvents.portalyProductId, portalyProductId),
      inArray(portalyMarketplaceEvents.status, ["pending", "pending_mapping", "failed"]),
    ),
    orderBy: (event, { asc }) => [asc(event.portalyCreatedAt), asc(event.createdAt)],
  });

  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    const result = await processMarketplaceEvent(event.id);
    if (result.success) {
      processed++;
    } else {
      failed++;
    }
  }

  logger.info("Batch processing complete", {
    portalyProductId,
    total: pending.length,
    processed,
    failed,
  });

  return { total: pending.length, processed, failed };
}
