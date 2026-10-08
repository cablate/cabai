import type {
  PortalyPlan,
  PortalySubscription,
  PortalyOrder,
  CreateSessionParams,
  SessionResponse,
  ListSubscriptionsParams,
  ListOrdersParams,
  CreatePortalSessionParams,
  PortalSessionResponse,
  CreatePortalyPlanParams,
  UpdatePortalyPlanParams,
} from "./portaly-types";
import { resolvePortalyConfig } from "./config/portaly";

// ─── Config ───

const PORTALY_API_HOST = process.env.PORTALY_API_HOST || "https://portaly.ai";

const PORTALY_CONFIG = resolvePortalyConfig();
export const PORTALY_MODE: "test" | "live" = PORTALY_CONFIG.mode ?? "test";
const PORTALY_API_KEY = PORTALY_CONFIG.apiKey ?? "";
const PORTALY_PROFILE_ID = PORTALY_CONFIG.profileId ?? "";
const PORTALY_REQUEST_TIMEOUT_MS = 10_000;
const PORTALY_READ_RETRIES = 1;
const PORTALY_READ_RETRY_DELAY_MS = 100;

// ─── Base fetch ───

function requestSignal(signal: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(PORTALY_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function retryableReadStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function providerError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const value of [record.error, record.message]) {
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
    }
  }
  return `Portaly request failed (HTTP ${status}).`;
}

async function responsePayload(response: Response): Promise<unknown | undefined> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

async function waitBeforeReadRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, PORTALY_READ_RETRY_DELAY_MS * (attempt + 1)));
}

export async function portalyFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ data?: T; error?: string }> {
  if (PORTALY_CONFIG.state !== "enabled") {
    return { error: "Portaly payment configuration is unavailable." };
  }

  const method = (options?.method ?? "GET").toUpperCase();
  const retryCount = method === "GET" ? PORTALY_READ_RETRIES : 0;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const res = await fetch(`${PORTALY_API_HOST}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PORTALY_API_KEY}`,
          ...options?.headers,
        },
        signal: requestSignal(options?.signal),
      });

      const payload = await responsePayload(res);
      if (!res.ok) {
        if (attempt < retryCount && retryableReadStatus(res.status)) {
          await waitBeforeReadRetry(attempt);
          continue;
        }
        return { error: providerError(payload, res.status) };
      }
      if (payload === undefined || !payload || typeof payload !== "object") {
        return { error: "Portaly returned an invalid JSON response." };
      }
      return payload as { data?: T; error?: string };
    } catch (error) {
      if (attempt < retryCount) {
        await waitBeforeReadRetry(attempt);
        continue;
      }
      return {
        error: isAbortError(error)
          ? "Portaly request timed out."
          : "Portaly request failed.",
      };
    }
  }

  return { error: "Portaly request failed." };
}

// ─── Plan queries ───

export async function getPlans(): Promise<{ data?: PortalyPlan[]; error?: string }> {
  const profileQuery = PORTALY_PROFILE_ID
    ? `?profileId=${encodeURIComponent(PORTALY_PROFILE_ID)}`
    : "";
  return portalyFetch<PortalyPlan[]>(
    `/api/creator-subscription/plans${profileQuery}`,
  );
}

export async function getPlan(planId: string): Promise<{ data?: PortalyPlan; error?: string }> {
  return portalyFetch<PortalyPlan>(
    `/api/creator-subscription/plans/${planId}`,
  );
}

// ─── Plan mutations ───

export async function createPortalyPlan(
  params: CreatePortalyPlanParams,
): Promise<{ data?: PortalyPlan; error?: string }> {
  return portalyFetch<PortalyPlan>(
    `/api/creator-subscription/plans`,
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

export async function updatePortalyPlan(
  planId: string,
  params: UpdatePortalyPlanParams,
): Promise<{ data?: PortalyPlan; error?: string }> {
  return portalyFetch<PortalyPlan>(
    `/api/creator-subscription/plans/${planId}`,
    {
      method: "PUT",
      body: JSON.stringify(params),
    },
  );
}

// ─── Checkout session ───

export async function createCheckoutSession(params: CreateSessionParams) {
  return portalyFetch<SessionResponse>(
    "/api/creator-subscription/checkout-sessions",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

export async function getCheckoutSession(sessionId: string) {
  return portalyFetch<Record<string, unknown>>(
    `/api/creator-subscription/checkout-sessions/${sessionId}`,
  );
}

// ─── Subscription lifecycle ───

export async function getSubscription(subscriptionId: string) {
  return portalyFetch<Record<string, unknown>>(
    `/api/creator-subscription/subscriptions/${subscriptionId}`,
  );
}

export async function cancelSubscription(
  subscriptionId: string,
  body: { reason?: string; reasonNote?: string } = {},
) {
  return portalyFetch<Record<string, unknown>>(
    `/api/creator-subscription/subscriptions/${subscriptionId}/cancel`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function resumeSubscription(subscriptionId: string) {
  return portalyFetch<Record<string, unknown>>(
    `/api/creator-subscription/subscriptions/${subscriptionId}/resume`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

// ─── Subscription list ───

export async function listSubscriptions(
  params: ListSubscriptionsParams = {},
): Promise<{ data?: PortalySubscription[]; error?: string }> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.customerEmail) searchParams.set("customerEmail", params.customerEmail);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.startAfter) searchParams.set("startAfter", params.startAfter);

  const qs = searchParams.toString();
  return portalyFetch<PortalySubscription[]>(
    `/api/creator-subscription/subscriptions${qs ? `?${qs}` : ""}`,
  );
}

// ─── Order list ───

export async function listOrders(
  params: ListOrdersParams = {},
): Promise<{ data?: PortalyOrder[]; error?: string }> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.startAfter) searchParams.set("startAfter", params.startAfter);

  const qs = searchParams.toString();
  return portalyFetch<PortalyOrder[]>(
    `/api/creator-subscription/orders${qs ? `?${qs}` : ""}`,
  );
}

// ─── Portal session (subscriber self-service) ───

export async function createPortalSession(params: CreatePortalSessionParams) {
  return portalyFetch<PortalSessionResponse>(
    "/api/creator-subscription/portal-sessions",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}
