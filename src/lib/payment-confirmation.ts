type CompletionOrder = {
  id: string;
  merchantOrderNumber: string;
  portalySessionId: string | null;
  planId: string;
  providerPlanId?: string | null;
  currency: string;
  expectedAmount: number | null;
  expectedCurrency: string | null;
};

type CompletionPlan = {
  id: string;
  providerPlanId?: string | null;
  amount: number | null;
  currency: string | null;
} | null | undefined;

type ConfirmationValidationInput = {
  order: CompletionOrder;
  plan?: CompletionPlan;
  confirmation: Record<string, unknown>;
  expectedMode: "test" | "live";
  requireMerchantOrderNumber?: boolean;
  requireAmount?: boolean;
  requireCurrency?: boolean;
};

export type ConfirmationFailureReason =
  | "status_mismatch"
  | "session_mismatch"
  | "merchant_order_mismatch"
  | "amount_mismatch"
  | "currency_mismatch"
  | "mode_mismatch"
  | "plan_mismatch";

export type ConfirmationValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: ConfirmationFailureReason;
      details: Record<string, unknown>;
    };

const COMPLETED_STATUSES = new Set(["completed", "checkout_completed", "paid"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function fail(
  reason: ConfirmationFailureReason,
  details: Record<string, unknown>,
): ConfirmationValidationResult {
  return { ok: false, reason, details };
}

export function validatePaymentConfirmation({
  order,
  plan,
  confirmation,
  expectedMode,
  requireMerchantOrderNumber = false,
  requireAmount = false,
  requireCurrency = false,
}: ConfirmationValidationInput): ConfirmationValidationResult {
  const status = asString(confirmation.status)?.toLowerCase() ?? null;
  if (!status || !COMPLETED_STATUSES.has(status)) {
    return fail("status_mismatch", {
      orderId: order.id,
      expected: Array.from(COMPLETED_STATUSES),
      got: status,
    });
  }

  const mode = asString(confirmation.mode)?.toLowerCase() ?? null;
  if (mode && mode !== expectedMode) {
    return fail("mode_mismatch", {
      orderId: order.id,
      expected: expectedMode,
      got: mode,
    });
  }

  const sessionId = asString(confirmation.sessionId) ?? asString(confirmation.id);
  if (order.portalySessionId && sessionId && sessionId !== order.portalySessionId) {
    return fail("session_mismatch", {
      orderId: order.id,
      expected: order.portalySessionId,
      got: sessionId,
    });
  }

  const merchantOrderNumber = asString(confirmation.merchantOrderNumber);
  if (
    (requireMerchantOrderNumber || merchantOrderNumber) &&
    merchantOrderNumber !== order.merchantOrderNumber
  ) {
    return fail("merchant_order_mismatch", {
      orderId: order.id,
      expected: order.merchantOrderNumber,
      got: merchantOrderNumber,
    });
  }

  const expectedProviderPlanId =
    order.providerPlanId ?? plan?.providerPlanId ?? plan?.id ?? order.planId;
  const providerPlanId = asString(confirmation.planId);
  if (providerPlanId && providerPlanId !== expectedProviderPlanId) {
    return fail("plan_mismatch", {
      orderId: order.id,
      expected: expectedProviderPlanId,
      got: providerPlanId,
    });
  }

  const paidAmount = asNumber(confirmation.amount);
  const expectedAmount = order.expectedAmount ?? plan?.amount ?? null;
  if (
    (requireAmount || paidAmount != null) &&
    expectedAmount != null &&
    paidAmount !== expectedAmount
  ) {
    return fail("amount_mismatch", {
      orderId: order.id,
      expected: expectedAmount,
      got: paidAmount,
    });
  }

  const paidCurrency = asString(confirmation.currency)?.toUpperCase() ?? null;
  const expectedCurrency =
    (order.expectedCurrency ?? order.currency ?? plan?.currency ?? null)?.toUpperCase() ?? null;
  if (
    (requireCurrency || paidCurrency) &&
    expectedCurrency &&
    paidCurrency !== expectedCurrency
  ) {
    return fail("currency_mismatch", {
      orderId: order.id,
      expected: expectedCurrency,
      got: paidCurrency,
    });
  }

  return { ok: true };
}

export function customerEmailMismatch(
  expectedEmail: string | null | undefined,
  payerEmail: string | null | undefined,
): boolean {
  if (!payerEmail) return false;
  const expected = expectedEmail?.toLowerCase().trim() ?? null;
  const actual = payerEmail.toLowerCase().trim();
  return !expected || expected !== actual;
}
