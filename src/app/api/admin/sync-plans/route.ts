import { NextResponse } from "next/server";
import {
  AdminActionRateLimitError,
  requireAdminAction,
} from "@/lib/admin-action-guard";
import { syncPlans } from "@/lib/sync-plans";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";

const logger = createLogger("admin/sync-plans");

export const POST = withApiHandler(
  { logger, operation: "admin sync plans", internalError: "Server error" },
  async (request) => {
  try {
    assertSameOriginRequest(request);
    await requireAdminAction("admin:sync-plans", { heavy: true });
  } catch (err) {
    if (err instanceof AdminActionRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await syncPlans();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ synced: result.synced });
  },
);
