"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { plans, serviceConfigs } from "@/lib/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";
import { generateServiceApiKey } from "@/lib/webhook-verify";
import { assertSafeOutboundUrl } from "@/lib/url-safety";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/admin-action-guard";

const createServiceSchema = z.object({
  planId: z.string().min(1, "請選擇方案"),
  serviceName: z
    .string()
    .min(1, "服務名稱必填")
    .regex(/^[a-z0-9-]+$/, "只允許小寫字母、數字和連字號"),
  webhookUrl: z.string().url("請輸入有效的 URL"),
});

export type ServiceConfigResult = {
  fieldErrors?: Record<string, string[]>;
  error?: string;
  success?: boolean;
  apiKey?: string;
} | null;

async function refreshExternalServiceFlag(planId: string) {
  const [activeCount] = await db
    .select({ value: count() })
    .from(serviceConfigs)
    .where(
      and(
        eq(serviceConfigs.planId, planId),
        eq(serviceConfigs.isActive, true),
        isNull(serviceConfigs.deletedAt),
      ),
    );

  await db
    .update(plans)
    .set({ hasExternalService: (activeCount?.value ?? 0) > 0 })
    .where(eq(plans.id, planId));
}

function revalidateServicePaths(planId: string) {
  revalidatePath("/admin/services");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${planId}/delivery`);
  revalidatePath(`/products/${planId}`);
  revalidatePath(`/content/${planId}`);
  revalidatePath("/dashboard");
}

export async function createServiceConfig(
  _prev: ServiceConfigResult,
  formData: FormData,
): Promise<ServiceConfigResult> {
  await requireAdminAction("service-config:create");

  const parsed = createServiceSchema.safeParse({
    planId: formData.get("planId"),
    serviceName: formData.get("serviceName"),
    webhookUrl: formData.get("webhookUrl"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { planId, serviceName, webhookUrl } = parsed.data;

  // F-29: reject webhook URLs that resolve to private / loopback /
  // metadata addresses before they land in the DB.
  try {
    await assertSafeOutboundUrl(webhookUrl);
  } catch (err) {
    return {
      fieldErrors: {
        webhookUrl: [err instanceof Error ? err.message : "Unsafe webhook URL"],
      },
    };
  }

  const { plainKey, prefix, hash } = generateServiceApiKey();

  try {
    await db.insert(serviceConfigs).values({
      planId,
      serviceName,
      webhookUrl,
      apiKeyPrefix: prefix,
      apiKeyHash: hash,
    });
    await db
      .update(plans)
      .set({ hasExternalService: true })
      .where(eq(plans.id, planId));
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return { error: "此方案已有同名服務" };
    }
    return { error: "建立失敗，請稍後再試" };
  }

  revalidateServicePaths(planId);
  return { success: true, apiKey: plainKey };
}

export async function toggleServiceConfig(id: string) {
  await requireAdminAction("service-config:toggle");

  const config = await db.query.serviceConfigs.findFirst({
    where: and(eq(serviceConfigs.id, id), isNull(serviceConfigs.deletedAt)),
  });

  if (!config) return;

  await db
    .update(serviceConfigs)
    .set({ isActive: !config.isActive, updatedAt: new Date() })
    .where(eq(serviceConfigs.id, id));

  await refreshExternalServiceFlag(config.planId);
  revalidateServicePaths(config.planId);
}

export async function deleteServiceConfig(id: string) {
  const session = await requireAdminAction("service-config:delete");

  const config = await db.query.serviceConfigs.findFirst({
    where: and(eq(serviceConfigs.id, id), isNull(serviceConfigs.deletedAt)),
  });

  if (!config) {
    revalidatePath("/admin/services");
    return;
  }

  await db
    .update(serviceConfigs)
    .set({ deletedAt: new Date(), deletedBy: session.user.id, updatedAt: new Date() })
    .where(eq(serviceConfigs.id, id));

  await refreshExternalServiceFlag(config.planId);
  revalidateServicePaths(config.planId);
}

export async function regenerateApiKey(id: string) {
  await requireAdminAction("service-config:regenerate-key");

  const { plainKey, prefix, hash } = generateServiceApiKey();

  await db
    .update(serviceConfigs)
    .set({ apiKeyPrefix: prefix, apiKeyHash: hash, updatedAt: new Date() })
    .where(eq(serviceConfigs.id, id));

  const config = await db.query.serviceConfigs.findFirst({
    where: eq(serviceConfigs.id, id),
  });

  if (config) revalidateServicePaths(config.planId);
  else revalidatePath("/admin/services");
  return { apiKey: plainKey };
}
