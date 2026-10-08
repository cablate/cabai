"use server";

import { requireAdminAction } from "@/lib/admin-action-guard";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { syncPlans } from "@/lib/sync-plans";
import { revalidatePath } from "next/cache";
import type { ReconciliationResult } from "@/lib/reconcile-subscriptions";
import { requireSnapshotBefore, SnapshotFailedError } from "@/lib/backup-guard";
import { runJob } from "@/lib/jobs/runner";

const logger = createLogger("system-action");

/**
 * Sync plans from Portaly — calls syncPlans() directly (no HTTP roundtrip)
 */
export async function syncPlansAction(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    await requireAdminAction("system:sync-plans", { heavy: true });

    const result = await syncPlans();

    if (result.error) {
      logger.error("Sync plans failed", { error: result.error });
      return { success: false, error: result.error };
    }

    logger.info("Sync plans succeeded", { synced: result.synced });
    return {
      success: true,
      message: `同步完成，共 ${result.synced} 個方案`,
    };
  } catch (err) {
    logger.error("Sync plans action error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: "操作失敗，請檢查日誌",
    };
  }
}

/**
 * Reconcile subscriptions through the canonical lifecycle service.
 */
export async function reconcileAction(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const session = await requireAdminAction("system:reconcile", { heavy: true });
    await requireSnapshotBefore("reconcile-subscriptions", {
      triggeredBy: session.user.id,
    });

    const run = await runJob("subscription-reconciliation", undefined, {
      trigger: "admin",
      triggerId: session.user.id,
    });
    if (!run.executed) {
      return { success: true, message: "訂閱對帳已在執行中，本次未重複啟動。" };
    }
    const result = run.result as ReconciliationResult;

    logger.info("Reconcile succeeded", {
      ...result,
    });
    return {
      success: result.errors === 0,
      message: `對帳完成：掃描 ${result.scanned} 個訂閱、更新 ${result.updated} 個、撤銷 ${result.revoked} 個，發生 ${result.errors} 個錯誤`,
      error: result.errors > 0 ? "部分訂閱對帳失敗，請檢查日誌。" : undefined,
    };
  } catch (err) {
    logger.error("Reconcile action error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: err instanceof SnapshotFailedError
        ? `備份失敗，已中止對帳：${err.message}`
        : "操作失敗，請檢查日誌",
    };
  }
}

/**
 * Cleanup stale pending orders (>24h)
 */
export async function cleanupOrdersAction(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    await requireAdminAction("system:cleanup-orders", { heavy: true });

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expired = await db
      .update(orders)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.status, "pending"),
          lt(orders.createdAt, cutoff),
        ),
      )
      .returning({ id: orders.id });

    logger.info("Cleanup orders succeeded", { count: expired.length });

    if (expired.length > 0) {
      revalidatePath("/admin/orders");
    }

    return {
      success: true,
      message: `清理完成，共 ${expired.length} 個訂單已過期`,
    };
  } catch (err) {
    logger.error("Cleanup orders action error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: "清理失敗，請檢查日誌",
    };
  }
}

/**
 * Rebuild orders from Portaly — pulls all orders and rebuilds local records
 */
export async function rebuildOrdersAction(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    await requireAdminAction("system:rebuild-orders", { heavy: true });

    const { requireSnapshotBefore, SnapshotFailedError } = await import("@/lib/backup-guard");
    try {
      await requireSnapshotBefore("rebuild-orders", {
        triggeredBy: "admin-ui",
      });
    } catch (err) {
      if (err instanceof SnapshotFailedError) {
        return { success: false, error: `快照失敗：${err.message}` };
      }
      throw err;
    }

    const { rebuildOrdersFromPortaly } = await import("@/lib/rebuild-orders");
    const result = await rebuildOrdersFromPortaly();

    logger.info("Rebuild orders succeeded", {
      scanned: result.portalyOrdersScanned,
      created: result.ordersCreated,
      updated: result.ordersUpdated,
      purchases: result.purchasesCreated,
      errors: result.errors.length,
    });

    revalidatePath("/admin/orders");

    const parts = [
      `掃描 ${result.portalyOrdersScanned} 筆`,
      `新建 ${result.ordersCreated}`,
      `更新 ${result.ordersUpdated}`,
      `權益 ${result.purchasesCreated}`,
    ];
    if (result.errors.length > 0) {
      parts.push(`錯誤 ${result.errors.length}`);
    }

    return {
      success: result.errors.length === 0,
      message: `重建完成：${parts.join("、")}`,
      error: result.errors.length > 0 ? `${result.errors.length} 個錯誤，請檢查日誌` : undefined,
    };
  } catch (err) {
    logger.error("Rebuild orders action error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: "重建失敗，請檢查日誌",
    };
  }
}
