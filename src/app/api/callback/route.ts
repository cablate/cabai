import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, plans, users } from "@/lib/db/schema";
import { verifyCallback, PORTALY_MODE } from "@/lib/portaly";
import { callbackLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { completeOrder } from "@/lib/order-lifecycle";
import { revokeOrderEntitlement } from "@/lib/entitlement-transitions";
import { customerEmailMismatch, validatePaymentConfirmation } from "@/lib/payment-confirmation";
import { createLogger } from "@/lib/logger";
import { maskEmail } from "@/lib/log-redact";
import { writeAuditLog } from "@/lib/audit";
import { callbackPayloadSchema, callbackHeadersSchema } from "@/lib/validations/callback";
import { captureOperationalException, captureOperationalMessage } from "@/lib/observability/capture";
import { recordEvent } from "@/lib/event-tracking";

const logger = createLogger("callback");

// Invalid or explicitly non-retryable callbacks are acknowledged without
// leaking validation details. Verified callbacks that fail during core
// processing must use a non-2xx response so Portaly can retry them.
const OK = () => NextResponse.json({ ok: true });
const RETRYABLE_FAILURE = () => NextResponse.json({ ok: false }, { status: 500 });

function callbackRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

function callbackDiagnostics(payload: unknown, signature: string) {
  const payloadForHash =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const payloadHash = crypto
    .createHash("sha256")
    .update(payloadForHash ?? "")
    .digest("hex")
    .slice(0, 16);

  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};

  return {
    payloadHash,
    signaturePrefix: signature.slice(0, 8),
    sessionId: typeof record.sessionId === "string" ? record.sessionId : null,
    merchantOrderNumber: typeof record.merchantOrderNumber === "string"
      ? record.merchantOrderNumber
      : null,
  };
}

export async function POST(request: Request) {
  const requestId = callbackRequestId(request);
  try {
    const response = await handleCallback(request);
    response.headers.set("x-request-id", requestId);
    if (response.status >= 500) {
      captureOperationalMessage("Verified callback requires provider retry", "error", {
        errorCode: "CALLBACK_RETRYABLE_FAILURE",
        method: request.method,
        operation: "process payment callback",
        requestId,
        route: request.url,
        runtime: "nodejs",
        surface: "callback",
      });
    }
    return response;
  } catch (error) {
    captureOperationalException(error, {
      errorCode: "CALLBACK_INTERNAL_ERROR",
      method: request.method,
      operation: "process payment callback",
      requestId,
      route: request.url,
      runtime: "nodejs",
      surface: "callback",
    });
    logger.error("Verified callback failed before acknowledgement", {
      requestId,
      errorCode: "CALLBACK_INTERNAL_ERROR",
    });
    return NextResponse.json(
      { ok: false },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}

async function handleCallback(request: Request) {
  // Rate limit callback endpoint
  const ip = getClientIp(request.headers);
  const rl = callbackLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

  // F-30: validate signature headers via schema instead of three ad-hoc
  // string fetches with `?? ""` fallbacks. Missing/empty headers now fail
  // fast with a provider-safe 200 (same response shape as a bad
  // signature) rather than continuing into verifyCallback with empty
  // strings.
  const headerParse = callbackHeadersSchema.safeParse({
    timestamp: request.headers.get("x-portaly-timestamp") ?? "",
    signature: request.headers.get("x-portaly-signature") ?? "",
    event: request.headers.get("x-portaly-event") ?? "",
  });
  if (!headerParse.success) {
    logger.warn("Missing or invalid Portaly callback headers");
    return OK();
  }
  const { timestamp, signature, event } = headerParse.data;

  logger.info("Received event", { event });

  // Parse body
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (err) {
    logger.error("Failed to parse JSON body", { error: String(err) });
    return OK();
  }

  // Verify signature — always return 200 regardless of result
  const isValid = verifyCallback(payload, timestamp, signature);
  if (!isValid) {
    logger.warn("Signature verification failed", {
      event,
      timestamp,
      ...callbackDiagnostics(payload, signature),
    });
    return OK();
  }

  // Portaly v1 signs the body, not the event header independently.
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || (payload as Record<string, unknown>).event !== event) {
    logger.warn("Callback event does not match authenticated body");
    return OK();
  }

  // Event routing
  const CHECKOUT_EVENTS = [
    "creator_subscription.checkout.completed",
    "checkout.completed",
  ];
  const REVOKE_EVENTS = [
    "subscription.canceled",
    "subscription.expired",
    "checkout.refunded",
    "creator_subscription.canceled",
    "creator_subscription.expired",
  ];
  const isCheckout = CHECKOUT_EVENTS.includes(event);
  const isRevoke = REVOKE_EVENTS.includes(event);

  if (!isCheckout && !isRevoke) {
    logger.info("Ignoring unhandled event type", { event });
    return OK();
  }

  // ─── Revoke path: refund/cancel events ───
  if (isRevoke) {
    return handleRevokeEvent(event, payload as Record<string, unknown>);
  }

  // ─── Checkout path: validate payload structure ───
  const parsed = callbackPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("Invalid callback payload structure", {
      errors: parsed.error.issues.map((i) => i.message),
    });
    return OK();
  }
  const body = parsed.data;
  const sessionId = body.sessionId;
  const merchantOrderNumber = body.merchantOrderNumber;
  // F-01: never fall back sessionId into subscriptionId. A one-time purchase
  // has no real subscription, and downstream code that sees a non-null
  // subscriptionId treats the order as recurring (lookup against Portaly
  // subscriptions API, access-check via subscription path, etc.). Keep null
  // for one-time so the order is classified by subscriptionStatus instead.
  const subscriptionId = body.subscriptionId ?? null;
  const paidAmount = body.amount;
  const paymentMethod = body.paymentMethod;
  const callbackMode = body.mode;

  logger.info("Signature verified", { sessionId });

  // Test/Live mode isolation: reject callbacks from wrong environment
  if (callbackMode && callbackMode !== PORTALY_MODE) {
    logger.error("Mode mismatch", { expected: PORTALY_MODE, got: callbackMode });
    return OK();
  }

  if (!sessionId && !merchantOrderNumber) {
    logger.error("Missing both sessionId and merchantOrderNumber in payload");
    return OK();
  }

  // Find the order — try sessionId first, then fallback to merchantOrderNumber
  let order = sessionId
    ? await db.query.orders.findFirst({
        where: eq(orders.portalySessionId, sessionId),
      })
    : null;

  if (!order && merchantOrderNumber) {
    logger.info("Fallback lookup by merchantOrderNumber", { merchantOrderNumber });
    order = await db.query.orders.findFirst({
      where: eq(orders.merchantOrderNumber, merchantOrderNumber),
    });

    // If found by merchantOrderNumber but missing sessionId, backfill it
    if (order && sessionId && !order.portalySessionId) {
      await db
        .update(orders)
        .set({ portalySessionId: sessionId, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      logger.info("Backfilled portalySessionId", { orderId: order.id });
    }
  }

  if (!order) {
    logger.error("Order not found", { sessionId, merchantOrderNumber });
    return OK();
  }

  logger.info("Found order", { orderId: order.id, status: order.status });

  // These terminal states cannot be repaired by replaying the same checkout
  // callback. Preserve the provider-safe acknowledgement contract while still
  // allowing completed orders through the idempotent completion path.
  if (order.status !== "pending" && order.status !== "completed") {
    logger.warn("Ignoring checkout callback for non-completable order", {
      orderId: order.id,
      status: order.status,
    });
    return OK();
  }

  // ─── Payment confirmation verification ───
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, order.planId),
    columns: { id: true, providerPlanId: true, amount: true, currency: true },
  });

  const confirmation = validatePaymentConfirmation({
    order,
    plan,
    confirmation: body as Record<string, unknown>,
    expectedMode: PORTALY_MODE,
    requireAmount: true,
    requireCurrency: true,
  });
  if (!confirmation.ok) {
    logger.error("Payment confirmation validation failed", {
      reason: confirmation.reason,
      ...confirmation.details,
    });
    return OK();
  }

  // ─── Customer email audit ───
  // Portaly customerEmail is informational for our app. The local order/session
  // binding decides entitlement ownership, so mismatches are audited but do not
  // block an otherwise valid payment confirmation.
  if (body.customerEmail) {
    const orderUser = await db.query.users.findFirst({
      where: eq(users.id, order.userId),
      columns: { email: true },
    });
    if (customerEmailMismatch(orderUser?.email, body.customerEmail)) {
      logger.warn("Callback customerEmail differs from order owner; continuing", {
        orderId: order.id,
        expected: maskEmail(orderUser?.email),
        got: maskEmail(body.customerEmail),
      });
    }
  }

  // ─── Idempotent order completion via shared lifecycle ───
  try {
    const result = await completeOrder(order.id, order.userId, order.planId, {
      subscriptionId: subscriptionId ?? null,
      paidAmount: paidAmount ?? null,
      paymentMethod: paymentMethod ?? null,
      callbackPayload: payload as Record<string, unknown>,
      triggeredBy: "callback.portaly",
    });

    if (!result.completed) {
      logger.error("Failed to complete order", { orderId: order.id });
      return RETRYABLE_FAILURE();
    }

    logger.info("Order completed", { orderId: order.id, wasAlready: result.wasAlreadyCompleted });

    // F-39: audit trail for entitlement-granting events from the
    // callback. Only emit on first completion (replays are idempotent
    // — logging them would add noise without new information).
    if (!result.wasAlreadyCompleted) {
      void writeAuditLog({
        actorType: "system",
        actorId: "callback.portaly",
        action: "order_completed",
        entityType: "order",
        entityId: order.id,
        metadata: {
          userId: order.userId,
          planId: order.planId,
          paidAmount: paidAmount ?? null,
          paymentMethod: paymentMethod ?? null,
          subscriptionId: subscriptionId ?? null,
          purchaseCreated: result.purchaseCreated,
        },
      });
    }

    // The grant transition is already durable in the same transaction as the
    // order and purchase. Analytics remains best-effort and non-authoritative.
    if (result.purchaseCreated && !result.wasAlreadyCompleted) {
      // Track purchase completed (fire-and-forget)
      try {
        await recordEvent({
          userId: order.userId,
          eventType: "purchase_completed",
          properties: {
            orderId: order.id,
            planId: order.planId,
            amount: paidAmount,
            type: subscriptionId ? "subscription" : "one-time",
          },
          source: "payment_callback",
        });
      } catch (trackErr) {
        logger.error("Failed to track purchase_completed", {
          error: String(trackErr),
          orderId: order.id,
        });
      }

    }

    return OK();
  } catch (err) {
    logger.error("Failed to complete order", { error: String(err) });
    return RETRYABLE_FAILURE();
  }
}

/**
 * Handle subscription cancel/expired/refund events.
 * Payload format from Portaly for these events is not fully documented,
 * so we try to extract sessionId or merchantOrderNumber to find the order.
 */
async function handleRevokeEvent(
  event: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  // Try common payload shapes to find the order
  const sessionId = (payload.sessionId ?? payload.session_id ?? "") as string;
  const merchantOrderNumber = (payload.merchantOrderNumber ?? payload.merchant_order_number ?? "") as string;
  const subscriptionId = (payload.subscriptionId ?? payload.subscription_id ?? "") as string;

  logger.info("Processing revoke event", { event, sessionId, merchantOrderNumber, subscriptionId });

  let order = sessionId
    ? await db.query.orders.findFirst({ where: eq(orders.portalySessionId, sessionId) })
    : null;

  if (!order && merchantOrderNumber) {
    order = await db.query.orders.findFirst({ where: eq(orders.merchantOrderNumber, merchantOrderNumber) });
  }

  if (!order && subscriptionId) {
    order = await db.query.orders.findFirst({ where: eq(orders.subscriptionId, subscriptionId) });
  }

  if (!order) {
    logger.warn("Revoke event: order not found", { event, sessionId, merchantOrderNumber, subscriptionId });
    return OK();
  }

  const newStatus = event.includes("refund") ? "refunded" as const : "canceled" as const;
  const now = new Date();
  try {
    await revokeOrderEntitlement({
      orderId: order.id,
      source: order.subscriptionId ? "subscription" : "payment",
      triggeredBy: "callback.portaly",
      revokedBy: "callback.portaly",
      occurredAt: now,
      orderChanges: {
        status: newStatus,
        ...(event.includes("refund") ? { refundedAt: now } : {}),
      },
    });
  } catch (err) {
    logger.error("Failed to persist entitlement revocation on callback", {
      error: String(err),
      orderId: order.id,
      userId: order.userId,
    });
    return RETRYABLE_FAILURE();
  }

  // Track revoke event (fire-and-forget)
  try {
    await recordEvent({
      userId: order.userId,
      eventType: newStatus === "refunded" ? "purchase_refunded" : "subscription_canceled",
      properties: { orderId: order.id, planId: order.planId, status: newStatus, event },
      source: "payment_callback",
    });
  } catch (trackErr) {
    logger.error("Failed to track revoke event", {
      error: String(trackErr),
      orderId: order.id,
    });
  }

  logger.info("Revoke event processed", {
    event,
    orderId: order.id,
    userId: order.userId,
    planId: order.planId,
    newStatus,
  });

  // F-39: audit trail for entitlement-revoking events.
  void writeAuditLog({
    actorType: "system",
    actorId: "callback.portaly",
    action: newStatus === "refunded" ? "order_refunded" : "order_canceled",
    entityType: "order",
    entityId: order.id,
    metadata: {
      userId: order.userId,
      planId: order.planId,
      portalyEvent: event,
    },
  });

  return OK();
}
