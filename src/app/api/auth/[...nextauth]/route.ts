import { type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { authLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";

const { GET: originalGET, POST: originalPOST } = handlers;

// Only rate-limit POST (login attempts), not GET (session checks).
// GET /api/auth/session is called on every page navigation by Auth.js.
function withRateLimit(
  handler: (req: NextRequest) => Promise<Response>,
) {
  return async (req: NextRequest) => {
    const ip = getClientIp(req.headers);
    const rl = authLimiter.check(ip);
    if (!rl.success) return rateLimitResponse(rl.retryAfterMs);
    return handler(req);
  };
}

export const GET = originalGET;
export const POST = withRateLimit(originalPOST);
