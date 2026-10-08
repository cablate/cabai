import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { checkoutLimiter, getClientIp } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { createLogger } from "@/lib/logger";
import { grantStandaloneEntitlement } from "@/lib/entitlement-transitions";
import { recordEvent } from "@/lib/event-tracking";

const logger = createLogger("checkout-free-claim");

const formSchema = z.object({
  planId: z.string().uuid(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const rl = checkoutLimiter.check(ip);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs);

  try {
    assertSameOriginRequest(request);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Invalid form data", { status: 400 });
  }

  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return new Response("Invalid request", { status: 400 });
  }
  const { planId } = parsed.data;

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
    columns: { id: true, slug: true, status: true, purchaseButtonMode: true },
  });

  if (!plan || plan.status !== "active") {
    return new Response("Plan not found or unavailable", { status: 404 });
  }

  if (plan.purchaseButtonMode !== "free_claim") {
    return new Response("Plan is not configured for free claim", { status: 400 });
  }

  try {
    const grant = await grantStandaloneEntitlement({
      userId,
      planId,
      grantedBy: "free_claim",
      triggeredBy: "checkout.free-claim",
      duplicatePolicy: "same-source",
    });

    if (grant.created) {
      logger.info("Free claim granted", { userId, planId });

      // Track lead magnet claimed (fire-and-forget)
      recordEvent({
        userId,
        eventType: "lead_magnet_claimed",
        properties: { planId },
        source: "server",
      }).catch(() => {});
    }
  } catch (err) {
    logger.error("Failed to persist free_claim entitlement", {
      userId,
      planId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Failed to claim plan", { status: 500 });
  }

  redirect(plan.slug ? `/my/${plan.slug}` : `/my/${planId}`);
}
