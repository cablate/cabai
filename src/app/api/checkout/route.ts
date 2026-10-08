import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { createCheckoutSession } from "@/lib/portaly";
import { generateOrderNumber } from "@/lib/utils";
import { checkoutLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { createLogger } from "@/lib/logger";
import { checkoutSchema } from "@/lib/validations/checkout";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { appUrl } from "@/lib/app-url";
import {
  failCheckoutReservation,
  finalizeCheckoutReservation,
  reserveCheckout,
} from "@/lib/checkout-reservation";
import { recordEvent } from "@/lib/event-tracking";
import { inspectPortalyConfig } from "@/lib/config/portaly";

const logger = createLogger("checkout");

function assertProductionHttpsUrl(label: string, value: string): Response | null {
  if (process.env.NODE_ENV !== "production") return null;

  try {
    const url = new URL(value);
    if (url.protocol === "https:") return null;
  } catch {
    // Fall through to the same production-safe failure path below.
  }

  logger.error("Refusing to create Portaly checkout with non-HTTPS URL", {
    label,
  });
  return new Response("Payment service is not configured for production checkout.", {
    status: 500,
  });
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = checkoutLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);
  try {
    assertSameOriginRequest(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    logger.warn("Invalid form data", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Invalid form data", { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return new Response("Invalid request", { status: 400 });
  }
  const { planId, amount: parsedAmount } = parsed.data;

  const localPlan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
    columns: {
      name: true,
      amount: true,
      gateway: true,
      slug: true,
      status: true,
      billingPeriod: true,
      pricingType: true,
      currency: true,
      providerPlanId: true,
      purchaseButtonMode: true,
    },
  });

  if (!localPlan || localPlan.status !== "active") {
    return new Response("Plan not found or unavailable", { status: 404 });
  }

  if (localPlan.purchaseButtonMode === "external") {
    return new Response("This plan uses external checkout", { status: 400 });
  }

  if (localPlan.purchaseButtonMode === "disabled") {
    return new Response("Plan not available for purchase", { status: 400 });
  }

  if (localPlan.purchaseButtonMode === "free_claim") {
    return new Response("This plan is granted via free claim, not paid checkout", { status: 400 });
  }

  if (localPlan.gateway === "manual") {
    return new Response("Manual plans cannot use Portaly checkout", { status: 400 });
  }

  let expectedAmount = localPlan.amount;
  if (parsedAmount != null) {
    if (localPlan.pricingType !== "dynamic") {
      return new Response("This plan does not support custom amounts", { status: 400 });
    }
    expectedAmount = parsedAmount;
  } else if (localPlan.pricingType === "dynamic") {
    return new Response("Custom amount is required for dynamic pricing", { status: 400 });
  }

  const expectedCurrency = localPlan.currency ?? "TWD";
  const providerPlanId = localPlan.providerPlanId ?? planId;
  const usesSharedProviderPlan = providerPlanId !== planId;
  // A shared provider plan is reserved for Portaly dynamic one-time checkout.
  // The local plan can still be fixed-price; the provider session receives the
  // server-decided expectedAmount below.
  const providerRequiresAmount =
    localPlan.pricingType === "dynamic" || usesSharedProviderPlan;

  if (providerRequiresAmount && localPlan.billingPeriod !== "one-time") {
    return new Response("Dynamic provider plans only support one-time checkout", { status: 400 });
  }

  const paymentConfig = inspectPortalyConfig();
  if (paymentConfig.state !== "enabled") {
    logger.error("Refusing to create checkout with invalid Portaly configuration", {
      mode: paymentConfig.mode ?? "invalid",
      credentialSource: paymentConfig.credentialSource ?? "none",
      requireLive: paymentConfig.requireLive,
      missing: paymentConfig.missing,
      notes: paymentConfig.notes,
    });
    return new Response("Payment service is not configured safely.", { status: 503 });
  }
  if (!paymentConfig.mode) {
    logger.error("Refusing to create checkout without a resolved Portaly mode");
    return new Response("Payment service is not configured safely.", { status: 503 });
  }

  const merchantOrderNumber = generateOrderNumber();
  const userId = session.user.id;
  let reservation;
  try {
    reservation = await reserveCheckout({
      userId,
      planId,
      providerPlanId,
      providerMode: paymentConfig.mode,
      merchantOrderNumber,
      expectedAmount,
      expectedCurrency,
    });
  } catch (err) {
    logger.error("Failed to acquire checkout slot", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Failed to create order", { status: 500 });
  }

  if (reservation.kind === "reuse") {
    logger.info("Reusing pending order", { orderId: reservation.orderId });
    redirect(reservation.checkoutUrl);
  }

  if (reservation.kind === "in_progress") {
    logger.info("Checkout initialization already in progress", { orderId: reservation.orderId });
    return new Response("Checkout is being prepared. Please retry shortly.", {
      status: 409,
      headers: { "Retry-After": String(reservation.retryAfterSeconds) },
    });
  }

  const orderId = reservation.orderId;

  const callbackUrl =
    process.env.PORTALY_CALLBACK_URL ?? appUrl("/api/callback");
  const successRedirectUrl = appUrl(`/success?order=${merchantOrderNumber}&status=success`);
  const cancelRedirectUrl = appUrl(`/checkout/${localPlan.slug ?? planId}?canceled=1`);

  const invalidProductionUrl =
    assertProductionHttpsUrl("callbackUrl", callbackUrl) ??
    assertProductionHttpsUrl("successRedirectUrl", successRedirectUrl) ??
    assertProductionHttpsUrl("cancelRedirectUrl", cancelRedirectUrl);
  if (invalidProductionUrl) {
    await failCheckoutReservation(orderId);
    return invalidProductionUrl;
  }

  const { data, error } = await createCheckoutSession({
    planId: providerPlanId,
    merchantOrderNumber,
    callbackUrl,
    successRedirectUrl,
    cancelRedirectUrl,
    ...(providerRequiresAmount ? { amount: expectedAmount } : {}),
    ...(session.user.email ? { customerEmail: session.user.email } : {}),
    metadata: {
      order_id: orderId,
      user_id: session.user.id,
      local_plan_id: planId,
      local_plan_name: localPlan.name,
      local_plan_slug: localPlan.slug ?? "",
      provider_plan_id: providerPlanId,
      checkout_amount: String(expectedAmount),
      checkout_currency: expectedCurrency,
      pricing_type: localPlan.pricingType ?? "fixed",
    },
  });

  if (error || !data) {
    logger.error("Portaly session creation failed", { error: String(error) });
    await failCheckoutReservation(orderId);
    return new Response("Payment service unavailable. Please try again.", {
      status: 502,
    });
  }

  const checkoutSessionExpiresAt = new Date(data.expiresAt);
  if (
    Number.isNaN(checkoutSessionExpiresAt.getTime())
    || checkoutSessionExpiresAt <= new Date()
  ) {
    logger.error("Portaly returned an invalid checkout session expiry", {
      orderId,
      sessionId: data.sessionId,
    });
    await failCheckoutReservation(orderId);
    return new Response("Payment service returned an invalid checkout session. Please try again.", {
      status: 502,
    });
  }

  try {
    const finalized = await finalizeCheckoutReservation({
      orderId,
      portalySessionId: data.sessionId,
      checkoutUrl: data.checkoutUrl,
      checkoutSessionExpiresAt,
    });
    if (!finalized) {
      logger.warn("Checkout reservation was superseded before provider response", { orderId });
      return new Response("Checkout request expired. Please try again.", { status: 409 });
    }
  } catch (err) {
    logger.error("CRITICAL: Failed to persist sessionId, aborting redirect", {
      error: err instanceof Error ? err.message : String(err),
    });
    await failCheckoutReservation(orderId);
    return new Response("Failed to prepare order. Please try again.", {
      status: 500,
    });
  }

  // Track checkout started
  recordEvent({
    userId: session.user.id,
    eventType: "checkout_started",
    properties: { planId, orderId, merchantOrderNumber, planSlug: localPlan.slug },
    source: "server",
  }).catch(() => {});

  redirect(data.checkoutUrl);
}
