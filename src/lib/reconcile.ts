import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, plans, users } from "@/lib/db/schema";
import { getCheckoutSession, PORTALY_MODE } from "@/lib/portaly";
import { completeOrder } from "@/lib/order-lifecycle";
import { customerEmailMismatch, validatePaymentConfirmation } from "@/lib/payment-confirmation";
import { createLogger } from "@/lib/logger";
import { maskEmail } from "@/lib/log-redact";

const logger = createLogger("reconcile");

/**
 * Reconcile a pending order by checking Portaly session status.
 * If Portaly says completed but local order is still pending,
 * update the order and create userPurchase (self-healing for callback failures).
 *
 * Returns true if reconciliation happened (order was completed).
 */
export async function reconcileOrder(
  merchantOrderNumber: string,
  expectedUserId: string,
): Promise<boolean> {
  const order = await db.query.orders.findFirst({
    where: and(
      eq(orders.merchantOrderNumber, merchantOrderNumber),
      eq(orders.userId, expectedUserId),
    ),
  });

  if (!order) return false;
  if (order.status === "completed") return false; // already done
  if (!order.portalySessionId) {
    logger.warn("Order has no portalySessionId — cannot query Portaly, requires manual reconciliation", { orderId: order.id });
    return false;
  }

  // Query Portaly for session status
  const { data: session } = await getCheckoutSession(order.portalySessionId);
  if (!session) return false;

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, order.planId),
    columns: { id: true, providerPlanId: true, amount: true, currency: true },
  });

  const confirmation = validatePaymentConfirmation({
    order,
    plan,
    confirmation: session,
    expectedMode: PORTALY_MODE,
    requireMerchantOrderNumber: true,
  });
  if (!confirmation.ok) {
    logger.warn("Payment confirmation validation failed during reconciliation", {
      reason: confirmation.reason,
      ...confirmation.details,
    });
    return false;
  }

  const customerEmail = typeof session.customerEmail === "string" ? session.customerEmail : null;
  if (customerEmail) {
    const orderUser = await db.query.users.findFirst({
      where: eq(users.id, order.userId),
      columns: { email: true },
    });
    if (customerEmailMismatch(orderUser?.email, customerEmail)) {
      logger.warn("Reconciled session customerEmail differs from order owner; continuing", {
        orderId: order.id,
        expected: maskEmail(orderUser?.email),
        got: maskEmail(customerEmail),
      });
    }
  }

  logger.info("Completing order via reconciliation", { orderId: order.id });

  // F-01: never fall back sessionId into subscriptionId. See callback/route.ts
  // for the rationale — a one-time purchase must stay subscriptionId=null so
  // it doesn't get classified as a subscription downstream.
  const resolvedSubId = typeof session.subscriptionId === "string" ? session.subscriptionId : null;
  const paidAmount = typeof session.amount === "number" ? session.amount : null;
  const paymentMethod = typeof session.paymentMethod === "string" ? session.paymentMethod : null;
  const callbackPayload = order.callbackPayload && typeof order.callbackPayload === "object"
    ? order.callbackPayload as Record<string, unknown>
    : session;

  const result = await completeOrder(order.id, order.userId, order.planId, {
    subscriptionId: resolvedSubId,
    paidAmount,
    paymentMethod,
    callbackPayload,
    triggeredBy: "reconcile.checkout-session",
  });

  if (result.completed) {
    logger.info("Ensured userPurchase", { userId: order.userId, planId: order.planId });
  }

  return result.completed && !result.wasAlreadyCompleted;
}
