import { NextResponse } from "next/server";
import { rebuildOrdersFromPortaly } from "@/lib/rebuild-orders";
import { requireSnapshotBefore, SnapshotFailedError } from "@/lib/backup-guard";
import {
  AdminActionRateLimitError,
  requireAdminAction,
} from "@/lib/admin-action-guard";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";

const logger = createLogger("admin/rebuild-orders");

export const POST = withApiHandler(
  { logger, operation: "admin rebuild orders", internalError: "Server error" },
  async (request) => {
  let adminUserId: string;
  try {
    assertSameOriginRequest(request);
    const session = await requireAdminAction("admin:rebuild-orders", { heavy: true });
    adminUserId = session.user.id;
  } catch (err) {
    if (err instanceof AdminActionRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let snapshotId: string;
  try {
    snapshotId = await requireSnapshotBefore("rebuild-orders", {
      triggeredBy: adminUserId,
    });
  } catch (err) {
    if (err instanceof SnapshotFailedError) {
      return NextResponse.json({
        error: "Snapshot failed - rebuild aborted.",
        detail: err.message,
      }, { status: 503 });
    }
    throw err;
  }

  const result = await rebuildOrdersFromPortaly();
  return NextResponse.json({ ...result, snapshotId });
  },
);
