import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";

const DEFAULT_INITIALIZATION_LEASE_MS = 2 * 60 * 1000;

export type CheckoutReservationResult =
  | { kind: "reuse"; orderId: string; checkoutUrl: string }
  | { kind: "in_progress"; orderId: string; retryAfterSeconds: number }
  | { kind: "new"; orderId: string; reservationExpiresAt: Date };

export async function reserveCheckout(input: {
  userId: string;
  planId: string;
  providerPlanId: string;
  providerMode: "test" | "live";
  merchantOrderNumber: string;
  expectedAmount: number;
  expectedCurrency: string;
  now?: Date;
  leaseMs?: number;
}): Promise<CheckoutReservationResult> {
  const now = input.now ?? new Date();
  const leaseMs = input.leaseMs ?? DEFAULT_INITIALIZATION_LEASE_MS;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000) {
    throw new Error("Checkout reservation lease must be at least one second.");
  }

  return db.transaction(async (tx): Promise<CheckoutReservationResult> => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout:${input.userId}:${input.planId}`}::text, 0))`,
    );

    const existing = await tx.query.orders.findFirst({
      where: and(
        eq(orders.userId, input.userId),
        eq(orders.planId, input.planId),
        eq(orders.status, "pending"),
      ),
      columns: {
        id: true,
        checkoutUrl: true,
        providerPlanId: true,
        providerMode: true,
        expectedAmount: true,
        expectedCurrency: true,
        checkoutReservationExpiresAt: true,
        checkoutSessionExpiresAt: true,
      },
    });

    const sameTerms = existing
      && existing.providerPlanId === input.providerPlanId
      && existing.providerMode === input.providerMode
      && (existing.expectedAmount ?? input.expectedAmount) === input.expectedAmount
      && (existing.expectedCurrency ?? input.expectedCurrency) === input.expectedCurrency;

    if (
      existing?.checkoutUrl
      && sameTerms
      && existing.checkoutSessionExpiresAt
      && existing.checkoutSessionExpiresAt > now
    ) {
      return { kind: "reuse", orderId: existing.id, checkoutUrl: existing.checkoutUrl };
    }

    if (
      existing
      && !existing.checkoutUrl
      && sameTerms
      && existing.checkoutReservationExpiresAt
      && existing.checkoutReservationExpiresAt > now
    ) {
      return {
        kind: "in_progress",
        orderId: existing.id,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.checkoutReservationExpiresAt.getTime() - now.getTime()) / 1_000),
        ),
      };
    }

    if (existing) {
      await tx
        .update(orders)
        .set({ status: "failed", checkoutReservationExpiresAt: null, updatedAt: now })
        .where(and(eq(orders.id, existing.id), eq(orders.status, "pending")));
    }

    const reservationExpiresAt = new Date(now.getTime() + leaseMs);
    const [created] = await tx
      .insert(orders)
      .values({
        userId: input.userId,
        planId: input.planId,
        providerPlanId: input.providerPlanId,
        providerMode: input.providerMode,
        merchantOrderNumber: input.merchantOrderNumber,
        status: "pending",
        currency: input.expectedCurrency,
        expectedAmount: input.expectedAmount,
        expectedCurrency: input.expectedCurrency,
        checkoutReservationExpiresAt: reservationExpiresAt,
      })
      .returning({ id: orders.id });
    if (!created) throw new Error("Unable to create checkout reservation.");
    return { kind: "new", orderId: created.id, reservationExpiresAt };
  });
}

export async function finalizeCheckoutReservation(input: {
  orderId: string;
  portalySessionId: string;
  checkoutUrl: string;
  checkoutSessionExpiresAt: Date;
  now?: Date;
}): Promise<boolean> {
  const [updated] = await db
    .update(orders)
    .set({
      portalySessionId: input.portalySessionId,
      checkoutUrl: input.checkoutUrl,
      checkoutSessionExpiresAt: input.checkoutSessionExpiresAt,
      checkoutReservationExpiresAt: null,
      updatedAt: input.now ?? new Date(),
    })
    .where(and(eq(orders.id, input.orderId), eq(orders.status, "pending")))
    .returning({ id: orders.id });
  return Boolean(updated);
}

export async function failCheckoutReservation(orderId: string, now = new Date()): Promise<boolean> {
  const [updated] = await db
    .update(orders)
    .set({
      status: "failed",
      checkoutReservationExpiresAt: null,
      checkoutSessionExpiresAt: null,
      updatedAt: now,
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning({ id: orders.id });
  return Boolean(updated);
}
