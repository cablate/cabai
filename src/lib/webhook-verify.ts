/**
 * Webhook signing & service key verification for the Entitlement Hub.
 *
 * - signPayload(): HMAC-SHA256 signing for outbound webhooks
 * - verifyServiceKey(): SHA-256 + prefix lookup for inbound API authentication
 */
import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceConfigs } from "@/lib/db/schema";
import { stableJson } from "@/lib/stable-json";

// ─── Outbound: sign webhook payloads ───

export function signPayload(
  apiKey: string,
  payload: unknown,
  timestamp: string,
): string {
  return crypto
    .createHmac("sha256", apiKey)
    .update(`${timestamp}.${stableJson(payload)}`)
    .digest("hex");
}

// ─── Inbound: verify service API key ───

/**
 * Verify an API key from the x-service-key header.
 * Uses SHA-256 + prefix lookup (not bcrypt — this is a hot path).
 *
 * Returns the matching serviceConfig row if valid, null if not.
 */
export async function verifyServiceKey(
  plainKey: string,
  planId?: string,
): Promise<typeof serviceConfigs.$inferSelect | null> {
  if (!plainKey || plainKey.length < 8) return null;

  const hash = crypto.createHash("sha256").update(plainKey).digest("hex");

  // F-24: keys now use a 16-char prefix ("svc_live_" + 7 random chars)
  // so the prefix index actually narrows the lookup. Legacy keys minted
  // before this change have prefix length 8 (always "svc_live"). Try
  // the long prefix first; fall back to the legacy 8-char lookup so
  // existing integrations keep working until they rotate.
  const candidatePrefixes = [plainKey.slice(0, 16), plainKey.slice(0, 8)];

  for (const prefix of candidatePrefixes) {
    const configs = await db
      .select()
      .from(serviceConfigs)
      .where(and(eq(serviceConfigs.apiKeyPrefix, prefix), isNull(serviceConfigs.deletedAt)));

    for (const config of configs) {
      // Timing-safe compare of hashes
      const a = Buffer.from(config.apiKeyHash, "utf8");
      const b = Buffer.from(hash, "utf8");
      if (a.byteLength === b.byteLength && crypto.timingSafeEqual(a, b)) {
        if (planId && config.planId !== planId) continue;
        if (!config.isActive) continue;
        return config;
      }
    }
  }

  return null;
}

// ─── API key generation ───

/**
 * Generate a new service API key.
 * Returns { plainKey, prefix, hash } — plainKey is shown once, only hash is stored.
 */
export function generateServiceApiKey(): {
  plainKey: string;
  prefix: string;
  hash: string;
} {
  const randomBytes = crypto.randomBytes(24).toString("base64url"); // 32 chars
  const plainKey = `svc_live_${randomBytes}`;
  // F-24: 16-char prefix ("svc_live_" + 7 random) so the prefix index
  // actually narrows the lookup. The legacy 8-char prefix was always
  // "svc_live" — every row matched, defeating the index.
  const prefix = plainKey.slice(0, 16);
  const hash = crypto.createHash("sha256").update(plainKey).digest("hex");
  return { plainKey, prefix, hash };
}
