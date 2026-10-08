import { isIP } from "node:net";

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Limitations:
 * - State resets on server/serverless cold start — acceptable for
 *   abuse prevention, not for billing-grade enforcement.
 * - No cross-instance sync — each Vercel function instance has its own map.
 *
 * For production upgrade path: switch to Vercel KV or Upstash Redis.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
  }
  return store;
}

export function createRateLimiter(name: string, opts: RateLimiterOptions) {
  const store = getStore(name);

  return {
    /**
     * Check if the key (typically IP) is within rate limit.
     * Returns { success, remaining, retryAfterMs }.
     */
    check(key: string): {
      success: boolean;
      remaining: number;
      retryAfterMs: number;
    } {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry) {
        store.set(key, { tokens: opts.limit - 1, lastRefill: now });
        return { success: true, remaining: opts.limit - 1, retryAfterMs: 0 };
      }

      // Refill tokens based on elapsed time
      const elapsed = now - entry.lastRefill;
      const refill = Math.floor((elapsed / opts.windowMs) * opts.limit);

      if (refill > 0) {
        entry.tokens = Math.min(opts.limit, entry.tokens + refill);
        entry.lastRefill = now;
      }

      if (entry.tokens > 0) {
        entry.tokens--;
        return { success: true, remaining: entry.tokens, retryAfterMs: 0 };
      }

      const msUntilRefill = opts.windowMs - elapsed;
      return {
        success: false,
        remaining: 0,
        retryAfterMs: Math.max(msUntilRefill, 1000),
      };
    },
  };
}

// ─── Pre-configured limiters ───

/** Checkout: 10 req / 60s per IP */
export const checkoutLimiter = createRateLimiter("checkout", {
  limit: 10,
  windowMs: 60_000,
});

/** Callback (webhook receiver): 30 req / 60s per IP */
export const callbackLimiter = createRateLimiter("callback", {
  limit: 30,
  windowMs: 60_000,
});

/** Entitlement API: 60 req / 60s per IP */
export const entitlementLimiter = createRateLimiter("entitlement", {
  limit: 60,
  windowMs: 60_000,
});

/** Auth (login attempts, POST only): 10 req / 60s per IP */
export const authLimiter = createRateLimiter("auth", {
  limit: 10,
  windowMs: 60_000,
});

/** Agent API: 600 req / 60s per API key — generous for batch ops, prevents runaway loops */
export const agentLimiter = createRateLimiter("agent", {
  limit: 600,
  windowMs: 60_000,
});

/** Portaly marketplace webhook: 30 req / 60s per IP */
export const marketplaceLimiter = createRateLimiter("marketplace", {
  limit: 30,
  windowMs: 60_000,
});

/** General API: 30 req / 60s per IP — for routes without a specific limiter */
export const generalApiLimiter = createRateLimiter("general-api", {
  limit: 30,
  windowMs: 60_000,
});

// ─── Client IP helper ───

/** Trust only an explicitly configured, ingress-overwritten single-IP header. */
export function getClientIp(headers: Pick<Headers, "get">): string {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (header !== "x-real-ip" && header !== "cf-connecting-ip") return "unknown";
  const value = headers.get(header)?.trim();
  if (!value || value.includes("%")) return "unknown";
  const family = isIP(value);
  if (family === 4) return value;
  if (family === 6) return new URL(`http://[${value}]/`).hostname.slice(1, -1);
  return "unknown";
}

// ─── Cleanup: evict stale entries every 5 minutes ───
// Prevents memory leak from accumulating IP entries.
if (typeof globalThis !== "undefined") {
  const CLEANUP_INTERVAL = 5 * 60_000;
  const MAX_AGE = 10 * 60_000;

  // Use globalThis to avoid duplicate intervals in dev hot-reload
  const key = "__rate_limit_cleanup__";
  if (!(globalThis as Record<string, unknown>)[key]) {
    (globalThis as Record<string, unknown>)[key] = setInterval(() => {
      const now = Date.now();
      for (const store of stores.values()) {
        for (const [ip, entry] of store) {
          if (now - entry.lastRefill > MAX_AGE) {
            store.delete(ip);
          }
        }
      }
    }, CLEANUP_INTERVAL);
  }
}
