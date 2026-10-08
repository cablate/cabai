"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin-action-guard";
import {
  grantStandaloneEntitlement,
  revokePurchaseEntitlement,
} from "@/lib/entitlement-transitions";

const grantSchema = z.object({
  userId: z.string().min(1, "userId 為必填"),
  planId: z.string().min(1, "請選擇方案"),
});

export type GrantAccessResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
} | null;

export async function grantAccess(
  _prev: GrantAccessResult,
  formData: FormData,
): Promise<GrantAccessResult> {
  const adminSession = await requireAdminAction("member-access:grant");

  const parsed = grantSchema.safeParse({
    userId: formData.get("userId"),
    planId: formData.get("planId"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { userId, planId } = parsed.data;

  const grant = await grantStandaloneEntitlement({
    userId,
    planId,
    grantedBy: "manual",
    triggeredBy: `admin:${adminSession.user!.id}`,
    duplicatePolicy: "any-active",
  });
  if (!grant.created) {
    return { error: "此會員已擁有該方案的有效資格" };
  }

  revalidatePath(`/admin/members/${userId}`);
  redirect(`/admin/members/${userId}`);
}

// ─── Revoke Access ───

const revokeSchema = z.object({
  purchaseId: z.string().min(1),
  userId: z.string().min(1),
});

export type RevokeAccessResult = { error?: string } | null;

export async function revokeAccess(
  _prev: RevokeAccessResult,
  formData: FormData,
): Promise<RevokeAccessResult> {
  const adminSession = await requireAdminAction("member-access:revoke");

  const parsed = revokeSchema.safeParse({
    purchaseId: formData.get("purchaseId"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    return { error: "參數錯誤" };
  }

  const { purchaseId, userId } = parsed.data;
  const revoked = await revokePurchaseEntitlement({
    purchaseId,
    userId,
    revokedBy: adminSession.user!.id,
    triggeredBy: `admin:${adminSession.user!.id}`,
  });

  if (!revoked) {
    return { error: "找不到該授權記錄" };
  }

  revalidatePath(`/admin/members/${userId}`);
  return null;
}
