/**
 * User-level API token authentication for external AI agent access.
 *
 * Separate from agent-auth.ts (admin management tokens, cab_agent_xxx).
 * User tokens (cab_user_xxx) are scoped to reading the user's own course content.
 */

import { db } from "@/lib/db";
import { userApiTokens } from "@/lib/db/schema";
import { count, eq, and, isNull, or, gt } from "drizzle-orm";
import { createRateLimiter } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { createLogger } from "@/lib/logger";
import {
  normalizeUserTokenScopes,
  USER_TOKEN_SAFE_PROFILE,
  userTokenHasScope,
  type UserTokenPermission,
} from "@/lib/user-token-permissions";

const logger = createLogger("user-auth");

/** Maximum active tokens per user */
const MAX_ACTIVE_TOKENS = 10;

const KEY_PREFIX = "cab_user_";

/** Rate limiter: 30 req / 60s per token */
const userTokenLimiter = createRateLimiter("user-token", {
  limit: 30,
  windowMs: 60_000,
});

/**
 * Generate a new user API token.
 * Returns the full key (shown once) and metadata.
 */
export async function generateUserToken(
  userId: string,
  expiresInDays?: number,
): Promise<{ fullToken: string; tokenId: string; prefix: string }> {
  // Enforce max active tokens
  const activeCount = await db
    .select({ count: count() })
    .from(userApiTokens)
    .where(
      and(
        eq(userApiTokens.userId, userId),
        eq(userApiTokens.revoked, false),
        or(
          isNull(userApiTokens.expiresAt),
          gt(userApiTokens.expiresAt, new Date()),
        ),
      ),
    );

  if ((activeCount[0]?.count ?? 0) >= MAX_ACTIVE_TOKENS) {
    throw new Error(`Maximum of ${MAX_ACTIVE_TOKENS} active tokens reached`);
  }

  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(32)))
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
    .insert(userApiTokens)
    .values({
      userId,
      tokenHash: keyHash,
      tokenPrefix: prefix,
      scopes: [...USER_TOKEN_SAFE_PROFILE],
      expiresAt,
    })
    .returning({ id: userApiTokens.id });

  if (!record) throw new Error("Failed to create user API token");

  logger.info("User API token generated", {
    tokenId: record.id,
    userId,
    prefix,
  });

  return { fullToken: fullKey, tokenId: record.id, prefix };
}

/**
 * Revoke a user API token.
 */
export async function revokeUserToken(tokenId: string): Promise<void> {
  await db
    .update(userApiTokens)
    .set({ revoked: true })
    .where(eq(userApiTokens.id, tokenId));

  logger.info("User API token revoked", { tokenId });
}

/**
 * List active (non-revoked, non-expired) tokens for a user.
 * Returns only safe-to-expose metadata — never the hash or full token.
 */
export async function listUserTokens(userId: string) {
  const tokens = await db
    .select({
      id: userApiTokens.id,
      tokenPrefix: userApiTokens.tokenPrefix,
      scopes: userApiTokens.scopes,
      expiresAt: userApiTokens.expiresAt,
      lastUsedAt: userApiTokens.lastUsedAt,
      createdAt: userApiTokens.createdAt,
    })
    .from(userApiTokens)
    .where(
      and(
        eq(userApiTokens.userId, userId),
        eq(userApiTokens.revoked, false),
        or(
          isNull(userApiTokens.expiresAt),
          gt(userApiTokens.expiresAt, new Date()),
        ),
      ),
    )
    .orderBy(userApiTokens.createdAt);

  return tokens.map((token) => ({
    ...token,
    scopes: normalizeUserTokenScopes(token.scopes),
  }));
}

/**
 * Validate a user API key from a request header.
 * Checks: exists, not revoked, not expired.
 */
export async function validateUserToken(
  authHeader: string | null,
): Promise<{ userId: string; tokenId: string; scopes: UserTokenPermission[] } | null> {
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

  const record = await db.query.userApiTokens.findFirst({
    where: and(
      eq(userApiTokens.tokenHash, keyHash),
      eq(userApiTokens.revoked, false),
      or(
        isNull(userApiTokens.expiresAt),
        gt(userApiTokens.expiresAt, new Date()),
      ),
    ),
  });

  if (!record) return null;

  // Update last used timestamp (fire-and-forget)
  db.update(userApiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(userApiTokens.id, record.id))
    .catch(() => {});

  return {
    userId: record.userId,
    tokenId: record.id,
    scopes: normalizeUserTokenScopes(record.scopes),
  };
}

/**
 * Middleware-style guard for user-facing agent API routes.
 * Validates user token + applies rate limiting per token + checks scope.
 */
export async function requireUserToken(
  request: Request,
  requiredScope?: string,
): Promise<{ userId: string; tokenId: string; scopes: UserTokenPermission[] }> {
  const authHeader = request.headers.get("authorization");
  const result = await validateUserToken(authHeader);

  if (!result) {
    throw new Response(
      JSON.stringify({ error: "Invalid, revoked, or expired token" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Rate limit per token
  const rl = userTokenLimiter.check(result.tokenId);
  if (!rl.success) {
    throw rateLimitResponse(rl.retryAfterMs);
  }

  // Scope check
  if (
    requiredScope &&
    !userTokenHasScope(result.scopes, requiredScope)
  ) {
    throw new Response(
      JSON.stringify({
        error: `Insufficient permissions. Required scope: ${requiredScope}`,
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return result;
}
