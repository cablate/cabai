import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-guard";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

const normalAdminActionLimiter = createRateLimiter("admin-action", {
  limit: 60,
  windowMs: 60_000,
});

const heavyAdminActionLimiter = createRateLimiter("admin-heavy-action", {
  limit: 10,
  windowMs: 5 * 60_000,
});

export class AdminActionRateLimitError extends Error {
  constructor(retryAfterMs: number) {
    super(`Too many admin actions. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds.`);
    this.name = "AdminActionRateLimitError";
  }
}

type HeaderStore = Awaited<ReturnType<typeof headers>>;

async function getHeaderStore(): Promise<HeaderStore | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
}

export async function requireAdminAction(
  action: string,
  options: { heavy?: boolean } = {},
) {
  const session = await requireAdmin();
  const headerStore = await getHeaderStore();
  const limiter = options.heavy ? heavyAdminActionLimiter : normalAdminActionLimiter;
  const adminUserId = session?.user?.id ?? "unknown-admin";
  const key = `${adminUserId}:${headerStore ? getClientIp(headerStore) : "unknown"}:${action}`;
  const result = limiter.check(key);

  if (!result.success) {
    throw new AdminActionRateLimitError(result.retryAfterMs);
  }

  return session;
}
