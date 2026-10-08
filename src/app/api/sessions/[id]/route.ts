import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCheckoutSession } from "@/lib/portaly";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";

const logger = createLogger("sessions");

const handleGet = withApiHandler<{ params: Promise<{ id: string }> }>(
  { logger, operation: "fetch checkout session" },
  async (_request, context) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context!.params;

  // Ownership check: verify this session belongs to the requesting user
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.portalySessionId, id), eq(orders.userId, session.user.id)),
  });
  if (!order) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data, error } = await getCheckoutSession(id);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ data });
  },
);

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleGet(request, context);
}
