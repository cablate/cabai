export interface PortalyPlan {
  id: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  billingPeriod: "monthly" | "yearly" | "one-time";
  pricingType?: "fixed" | "dynamic";
  status: "active" | "inactive";
  image?: string;
  merchantPlanId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortalySubscription {
  id: string;
  profileId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  billingPeriod: "monthly" | "yearly" | "one-time";
  status: string;
  mode: "live" | "test";
  cancelAtPeriodEnd: boolean;
  nextBillingAt?: string;
  cancelRequestedAt?: string;
  cancelEffectiveAt?: string;
  canceledAt?: string;
  customerName?: string;
  customerEmail?: string;
  createdAt: string;
}

export interface PortalyOrder {
  id: string;
  profileId: string;
  amount: number;
  netTotal: number;
  fee: number;
  feeAmount: number;
  taxFee: number;
  taxFeeAmount: number;
  currency: string;
  status: string;
  name: string;
  email: string;
  paymentMethod: string;
  merchantOrderNumber?: string;
  creatorSubscriptionId?: string;
  creatorSubscriptionPlanId?: string;
  createdAt: string;
  paidAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    count: number;
  };
}

export interface CreateSessionParams {
  planId: string;
  merchantOrderNumber: string;
  callbackUrl: string;
  successRedirectUrl: string;
  cancelRedirectUrl: string;
  amount?: number;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface SessionResponse {
  sessionId: string;
  checkoutUrl: string;
  checkoutToken: string;
  expiresAt: string;
}

export interface ListSubscriptionsParams {
  status?: "active" | "past_due" | "canceled";
  customerEmail?: string;
  limit?: number;
  startAfter?: string;
}

export interface ListOrdersParams {
  status?: string;
  limit?: number;
  startAfter?: string;
}

export interface CreatePortalSessionParams {
  customerEmail?: string;
  subscriptionId?: string;
  returnUrl: string;
}

export interface PortalSessionResponse {
  portalSessionId: string;
  portalUrl: string;
  expiresAt: string;
}

// ─── Plan CRUD ───

export interface CreatePortalyPlanParams {
  name: string;
  billingPeriod: "monthly" | "yearly" | "one-time";
  amount?: number;
  currency?: string;
  pricingType?: "fixed" | "dynamic";
  description?: string;
  status?: "active" | "inactive";
  merchantPlanId?: string;
}

export type UpdatePortalyPlanParams = Partial<CreatePortalyPlanParams>;
