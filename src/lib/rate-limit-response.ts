import { NextResponse } from "next/server";

/**
 * Standard 429 response for rate-limited requests.
 *
 * F-37: applies ±20% jitter to the Retry-After value so that many
 * clients hitting the limit at the same moment don't all retry on the
 * same second and stampede the server again.
 */
export function rateLimitResponse(retryAfterMs: number): NextResponse {
  const jitterFactor = 1 + (Math.random() - 0.5) * 0.4; // in [0.8, 1.2]
  const adjustedMs = Math.max(1000, Math.round(retryAfterMs * jitterFactor));
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(adjustedMs / 1000)),
      },
    },
  );
}
