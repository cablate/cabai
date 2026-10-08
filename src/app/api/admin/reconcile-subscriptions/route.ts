import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { requireSnapshotBefore, SnapshotFailedError } from "@/lib/backup-guard";
import {
  AdminActionRateLimitError,
  requireAdminAction,
} from "@/lib/admin-action-guard";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { withApiHandler } from "@/lib/api-route";
import type { ReconciliationResult } from "@/lib/reconcile-subscriptions";
import { runJob } from "@/lib/jobs/runner";

const logger = createLogger("admin-reconcile");

export const POST = withApiHandler(
  { logger, operation: "admin reconcile subscriptions", internalError: "Server error" },
  async (request) => {
  let adminUserId: string;
  try {
    assertSameOriginRequest(request);
    const session = await requireAdminAction("admin:reconcile-subscriptions", { heavy: true });
    adminUserId = session.user.id;
  } catch (err) {
    if (err instanceof AdminActionRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await requireSnapshotBefore("reconcile-subscriptions", {
      triggeredBy: adminUserId,
    });
  } catch (err) {
    if (err instanceof SnapshotFailedError) {
      return NextResponse.json({
        error: "Snapshot failed - reconciliation aborted.",
        detail: err.message,
      }, { status: 503 });
    }
    throw err;
  }

  const run = await runJob("subscription-reconciliation", undefined, {
    trigger: "admin",
    triggerId: adminUserId,
  });
  if (!run.executed) {
    return NextResponse.json({ success: true, executed: false });
  }
  const result = run.result as ReconciliationResult;
  return NextResponse.json({ ...result, success: result.errors === 0, executed: true });
  },
);
