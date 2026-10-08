export type SubscriptionFields = {
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  cancelEffectiveAt: Date | null;
  nextBillingAt: Date | null;
};

export function parseProviderDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize Portaly lifecycle fields into the local paid-through contract.
 *
 * Portaly may report an active subscription with cancelAtPeriodEnd=true and
 * omit cancelEffectiveAt. In that case nextBillingAt is the only durable
 * paid-through boundary. If neither timestamp is usable, callers fail closed
 * instead of retaining access indefinitely.
 */
export function normalizePortalySubscriptionFields(
  subscription: {
    status?: unknown;
    cancelAtPeriodEnd?: unknown;
    cancelEffectiveAt?: unknown;
    nextBillingAt?: unknown;
  },
): SubscriptionFields {
  const cancelAtPeriodEnd = subscription.cancelAtPeriodEnd === true;
  const nextBillingAt = parseProviderDate(subscription.nextBillingAt);
  const explicitCancelEffectiveAt = parseProviderDate(subscription.cancelEffectiveAt);

  return {
    subscriptionStatus: typeof subscription.status === "string" ? subscription.status : null,
    cancelAtPeriodEnd,
    cancelEffectiveAt: explicitCancelEffectiveAt ?? (cancelAtPeriodEnd ? nextBillingAt : null),
    nextBillingAt,
  };
}
