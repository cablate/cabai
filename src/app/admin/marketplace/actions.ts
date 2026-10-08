"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { db } from "@/lib/db";
import { portalyProductMappings, plans } from "@/lib/db/schema";
import { processPendingForProduct } from "@/lib/marketplace-processor";
import { writeAuditLog } from "@/lib/audit";
import {
  analyzePortalyPurchaseImport,
  applyPortalyPurchaseImport,
  type PortalyPurchaseImportApplyResult,
  type PortalyPurchaseImportPreview,
} from "@/lib/portaly-purchase-import";

type BatchResult = { total: number; processed: number; failed: number };
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const csvMimeTypes = new Set([
  "",
  "application/csv",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

const xlsxMimeTypes = new Set([
  "",
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export type PortalyPurchaseImportPreviewActionResult =
  | { success: true; preview: PortalyPurchaseImportPreview }
  | { success: false; error: string };

export type PortalyPurchaseImportApplyActionResult =
  | { success: true; result: PortalyPurchaseImportApplyResult }
  | { success: false; error: string };

export async function createMappingAction(
  portalyProductId: string,
  planId: string,
  productName: string,
): Promise<{ success: boolean; error?: string; batchResult?: BatchResult }> {
  try {
    const session = await requireAdminAction("marketplace-mapping:create", { heavy: true });
    const normalizedProductId = portalyProductId.trim();

    if (!normalizedProductId || !planId.trim()) {
      return { success: false, error: "Portaly 商品 ID 和 plan 都是必填。" };
    }

    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
      columns: { id: true, name: true },
    });
    if (!plan) {
      return { success: false, error: "找不到指定的 plan。" };
    }

    const existing = await db.query.portalyProductMappings.findFirst({
      where: eq(portalyProductMappings.portalyProductId, normalizedProductId),
    });
    if (existing) {
      return { success: false, error: "這個 Portaly 商品 ID 已經建立 mapping。" };
    }

    const [mapping] = await db
      .insert(portalyProductMappings)
      .values({
        portalyProductId: normalizedProductId,
        planId,
        productName: productName.trim() || null,
      })
      .returning({ id: portalyProductMappings.id });

    if (mapping) {
      await writeAuditLog({
        actorType: "user",
        actorId: session.user.id,
        action: "create",
        entityType: "portalyProductMapping",
        entityId: mapping.id,
        metadata: { portalyProductId: normalizedProductId, planId, planName: plan.name },
      });
    }

    const batchResult = await processPendingForProduct(normalizedProductId);

    revalidatePath("/admin/marketplace");
    return {
      success: batchResult.failed === 0,
      batchResult,
      error: batchResult.failed > 0 ? `${batchResult.failed} 筆 event 仍處理失敗。` : undefined,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "建立 mapping 失敗。" };
  }
}

export async function updateMappingAction(
  mappingId: string,
  newPlanId: string,
  newProductName: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("marketplace-mapping:update");

    const mapping = await db.query.portalyProductMappings.findFirst({
      where: eq(portalyProductMappings.id, mappingId),
    });
    if (!mapping) {
      return { success: false, error: "找不到指定的 mapping。" };
    }

    if (mapping.planId === newPlanId && mapping.productName === (newProductName || null)) {
      return { success: false, error: "沒有變更。" };
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const meta: Record<string, unknown> = { portalyProductId: mapping.portalyProductId };

    if (mapping.planId !== newPlanId) {
      const newPlan = await db.query.plans.findFirst({
        where: eq(plans.id, newPlanId),
        columns: { id: true, name: true },
      });
      if (!newPlan) return { success: false, error: "找不到指定的 plan。" };

      const previousPlan = await db.query.plans.findFirst({
        where: eq(plans.id, mapping.planId),
        columns: { id: true, name: true },
      });

      updates.planId = newPlanId;
      meta.previousPlanId = mapping.planId;
      meta.previousPlanName = previousPlan?.name ?? null;
      meta.newPlanId = newPlanId;
      meta.newPlanName = newPlan.name;
    }

    if (mapping.productName !== (newProductName || null)) {
      updates.productName = newProductName || null;
      meta.previousProductName = mapping.productName;
      meta.newProductName = newProductName || null;
    }

    meta.retroactive = false;

    await db
      .update(portalyProductMappings)
      .set(updates)
      .where(eq(portalyProductMappings.id, mappingId));

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "update",
      entityType: "portalyProductMapping",
      entityId: mappingId,
      metadata: meta,
    });

    revalidatePath("/admin/marketplace");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "更新 mapping 失敗。" };
  }
}

export async function deleteMappingAction(
  mappingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("marketplace-mapping:delete");

    const mapping = await db.query.portalyProductMappings.findFirst({
      where: eq(portalyProductMappings.id, mappingId),
    });
    if (!mapping) {
      return { success: false, error: "找不到指定的 mapping。" };
    }

    await db
      .delete(portalyProductMappings)
      .where(eq(portalyProductMappings.id, mappingId));

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "delete",
      entityType: "portalyProductMapping",
      entityId: mappingId,
      metadata: { portalyProductId: mapping.portalyProductId },
    });

    revalidatePath("/admin/marketplace");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "刪除 mapping 失敗。" };
  }
}

export async function retryFailedEventsAction(
  portalyProductId: string,
): Promise<{ success: boolean; error?: string; batchResult?: BatchResult }> {
  try {
    await requireAdminAction("marketplace-events:retry", { heavy: true });
    const batchResult = await processPendingForProduct(portalyProductId);
    revalidatePath("/admin/marketplace");
    return { success: true, batchResult };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "重跑 event 失敗。" };
  }
}

export async function previewPurchaseImportAction(
  formData: FormData,
): Promise<PortalyPurchaseImportPreviewActionResult> {
  try {
    await requireAdminAction("portaly-import:preview", { heavy: true });
    const input = await readImportFormData(formData);
    const preview = await analyzePortalyPurchaseImport(input);
    return { success: true, preview };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "匯入預覽失敗。",
    };
  }
}

export async function applyPurchaseImportAction(
  formData: FormData,
): Promise<PortalyPurchaseImportApplyActionResult> {
  try {
    const session = await requireAdminAction("portaly-import:apply", { heavy: true });
    const input = await readImportFormData(formData);
    const result = await applyPortalyPurchaseImport(input);

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "import",
      entityType: "portalyPurchaseImport",
      entityId: input.fileName,
      metadata: {
        fileName: input.fileName,
        planId: input.planId,
        totalRows: result.preview.totalRows,
        insertedEvents: result.insertedEvents,
        processedRows: result.processedRows,
        skippedRows: result.skippedRows,
        failedRows: result.failedRows,
      },
    });

    revalidatePath("/admin/marketplace");
    revalidatePath("/admin/orders");
    revalidatePath("/admin/members");

    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "匯入失敗。",
    };
  }
}

async function readImportFormData(formData: FormData): Promise<{
  fileName: string;
  bytes: Uint8Array;
  planId: string;
}> {
  const planId = String(formData.get("planId") ?? "").trim();
  const file = formData.get("file");

  if (!planId) {
    throw new Error("請先選擇要匯入到哪一個 plan。");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("請選擇 Portaly 匯出的 CSV 或 XLSX 檔案。");
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("匯入檔案太大，請控制在 5 MB 以內。");
  }

  const fileName = sanitizeImportFileName(file.name);
  const lowerName = fileName.toLowerCase();
  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
    throw new Error("目前只支援 CSV 或 XLSX 檔案。");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  validateImportFileSignature(fileName, file.type, bytes);

  return {
    fileName,
    bytes,
    planId,
  };
}

function sanitizeImportFileName(name: string): string {
  const baseName = name.split(/[\\/]/).pop()?.trim() || "portaly-import";
  const cleaned = baseName
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .slice(0, 120)
    .trim();
  return cleaned || "portaly-import";
}

function validateImportFileSignature(fileName: string, mimeType: string, bytes: Uint8Array): void {
  const lowerName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (lowerName.endsWith(".xlsx")) {
    if (!xlsxMimeTypes.has(normalizedMime)) {
      throw new Error("XLSX 檔案 MIME type 不符合預期。");
    }
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      throw new Error("XLSX 檔案格式不正確。");
    }
    return;
  }

  if (!csvMimeTypes.has(normalizedMime)) {
    throw new Error("CSV 檔案 MIME type 不符合預期。");
  }
  if (bytes.includes(0)) {
    throw new Error("CSV 檔案包含無效的二進位內容。");
  }
}
