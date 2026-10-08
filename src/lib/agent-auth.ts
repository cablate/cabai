import { db } from "@/lib/db";
import { agentApiKeys } from "@/lib/db/schema";
import { eq, and, isNull, or, gt } from "drizzle-orm";
import { createLogger } from "@/lib/logger";
import { agentLimiter } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";

// Client-safe permission constants + helpers live in agent-permissions
// (no db / pg imports). We re-export them here so existing server-side
// imports of `@/lib/agent-auth` keep working unchanged. Client components
// (e.g. admin/api-keys/api-key-manager.tsx) must import from
// `@/lib/agent-permissions` directly to avoid pulling pg into the bundle.
import {
  AGENT_PERMISSION_OPTIONS,
  DEFAULT_AGENT_PERMISSIONS,
  hasAgentPermission,
  normalizeAgentPermissions,
  type AgentPermission,
  type LegacyAgentPermission,
} from "@/lib/agent-permissions";

export {
  AGENT_PERMISSION_OPTIONS,
  DEFAULT_AGENT_PERMISSIONS,
  hasAgentPermission,
  normalizeAgentPermissions,
  type AgentPermission,
  type LegacyAgentPermission,
};

const logger = createLogger("agent-auth");

const KEY_PREFIX = "cab_agent_";

/**
 * Generate a new API key for an agent.
 * Returns the full key (shown once) and the DB record.
 */
export async function generateApiKey(
  name: string,
  createdBy: string,
  expiresInDays?: number,
  permissions: AgentPermission[] = DEFAULT_AGENT_PERMISSIONS,
): Promise<{ fullKey: string; keyId: string; prefix: string }> {
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const fullKey = `${KEY_PREFIX}${randomPart}`;
  const prefix = fullKey.slice(0, 16);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fullKey),
  );
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [record] = await db
    .insert(agentApiKeys)
    .values({
      name,
      keyPrefix: prefix,
      keyHash,
      permissions: normalizeAgentPermissions(permissions),
      createdBy,
      expiresAt,
    })
    .returning({ id: agentApiKeys.id });

  if (!record) throw new Error("Failed to create API key");

  logger.info("API key generated", {
    keyId: record.id,
    name,
    prefix,
    permissions: normalizeAgentPermissions(permissions),
    expiresAt: expiresAt?.toISOString(),
  });

  return { fullKey, keyId: record.id, prefix };
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(agentApiKeys.id, keyId));

  logger.info("API key revoked", { keyId });
}

/**
 * Validate an API key from a request.
 * Checks: exists, not revoked, not expired.
 */
export async function validateApiKey(
  authHeader: string | null,
): Promise<{ keyId: string; name: string; permissions: string[] } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token.startsWith(KEY_PREFIX)) return null;

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const record = await db.query.agentApiKeys.findFirst({
    where: and(
      eq(agentApiKeys.keyHash, keyHash),
      isNull(agentApiKeys.revokedAt),
      // Not expired: expiresAt is null (never expires) or > now
      or(isNull(agentApiKeys.expiresAt), gt(agentApiKeys.expiresAt, new Date())),
    ),
  });

  if (!record) return null;

  // Update last used timestamp (fire-and-forget)
  db.update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, record.id))
    .catch(() => {});

  return { keyId: record.id, name: record.name, permissions: normalizeAgentPermissions(record.permissions) };
}

/**
 * Middleware-style guard for agent API routes.
 * Validates API key + applies rate limiting per key + checks permission.
 *
 * @param required — if provided, the key must include this permission.
 *   Omit for backward compat during migration (all keys pass).
 */
export async function requireAgent(
  request: Request,
  required?: AgentPermission,
): Promise<{ keyId: string; name: string; agentId: string; permissions: string[] }> {
  const authHeader = request.headers.get("authorization");
  const result = await validateApiKey(authHeader);

  if (!result) {
    throw new Response(JSON.stringify({ error: "Invalid, expired, or missing API key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit per API key
  const rl = agentLimiter.check(result.keyId);
  if (!rl.success) {
    throw rateLimitResponse(rl.retryAfterMs);
  }

  // Permission check
  // SECURITY: Do not include the key's current permission list in the error
  // response — a low-scope caller probing a higher-scope endpoint would
  // otherwise discover the full scope of the key it already holds.
  if (required && !hasAgentPermission(result.permissions, required)) {
    throw new Response(JSON.stringify({
      error: `Insufficient permissions. Required: ${required}`,
    }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const label = request.headers.get("x-agent-id") || result.name;
  const agentId = `agent-key:${result.keyId}`;

  return { ...result, agentId, name: label };
}

/**
 * Require explicit confirmation header for destructive operations.
 * Returns void or throws 428 Precondition Required.
 */
export function requireDestructiveConfirmation(request: Request, expectedEntityId?: string): void {
  if (request.headers.get("x-confirm-destructive") !== "true") {
    throw new Response(JSON.stringify({
      error: "Destructive operation requires x-confirm-destructive: true header",
    }), {
      status: 428,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    expectedEntityId &&
    request.headers.get("x-confirm-entity-id") !== expectedEntityId
  ) {
    throw new Response(JSON.stringify({
      error: "Destructive operation requires x-confirm-entity-id to match the target id",
    }), {
      status: 428,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Parse an agent API `?limit=...` query parameter.
 *
 * F-25: previously `Math.min(Number(raw), 200)` silently coerced NaN,
 * negatives, decimals, and Infinity into surprising query behaviour.
 * Now validates as a positive integer ≤200 and throws a 400 Response
 * on invalid input (caught by the standard `if (err instanceof Response)
 * return err` pattern at the handler boundary).
 */
export function parseAgentLimit(raw: string | null, defaultValue = 50): number {
  if (raw === null || raw === "") return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 200) {
    throw new Response(JSON.stringify({
      error: "Invalid limit: expected positive integer ≤ 200",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return n;
}
