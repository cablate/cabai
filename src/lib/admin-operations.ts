import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminOperationSignalIds,
  type AdminOperationSignalId,
} from "@/lib/agent/operations-schemas";
import { createLogger } from "@/lib/logger";
import {
  agentInformationItems,
  courses,
  entitlementOutbox,
  libraryEntries,
  media,
  orders,
  skills,
  webhookLogs,
} from "@/lib/db/schema";

const logger = createLogger("admin-operations");

export type AdminOperationItem = {
  id: string;
  label: string;
  description: string;
  count: number | null;
  href: string;
  tone: "critical" | "warning" | "work";
};

export type AdminOperationsCounts = Record<AdminOperationSignalId, number | null>;

export type AdminOperationsSignalLoaders = Record<AdminOperationSignalId, () => Promise<number>>;

export type AdminOperationsOverview = {
  urgent: AdminOperationItem[];
  work: AdminOperationItem[];
  total: number | null;
  status: "ok" | "degraded";
  completeness: "complete" | "partial";
  unavailableSignals: AdminOperationSignalId[];
  observedAt: string;
};

export function buildAdminOperationsOverview(
  counts: AdminOperationsCounts,
): AdminOperationsOverview {
  const deadLetterDeliveries = counts.deadWebhookDeliveries === null
    || counts.deadEntitlementTransitions === null
    ? null
    : counts.deadWebhookDeliveries + counts.deadEntitlementTransitions;
  const urgent = ([
    {
      id: "dead-letter",
      label: "交付失敗",
      description: "Webhook 或權限交付已停止重試，需要排查原因。",
      count: deadLetterDeliveries,
      href: "/admin/webhooks?status=dead_letter",
      tone: "critical",
    },
    {
      id: "old-pending-orders",
      label: "逾時訂單",
      description: "訂單已等待超過 24 小時，需確認付款或清理狀態。",
      count: counts.oldPendingOrders,
      href: "/admin/orders?view=local",
      tone: "warning",
    },
    {
      id: "orphaned-media",
      label: "待處理媒體",
      description: "檔案未被內容引用，需確認保留或清理。",
      count: counts.orphanedMedia,
      href: "/admin/media?status=orphaned",
      tone: "warning",
    },
  ] satisfies AdminOperationItem[]).filter((item) => item.count === null || item.count > 0);

  const work = ([
    {
      id: "incomplete-plans",
      label: "商品設定待完成",
      description: "上架商品仍缺少已發布展示或完整交付設定。",
      count: counts.incompleteActivePlans,
      href: "/admin/plans",
      tone: "work",
    },
    {
      id: "draft-courses",
      label: "課程草稿",
      description: "尚未發布的課程，可繼續整理章節與內容。",
      count: counts.draftCourses,
      href: "/admin/courses",
      tone: "work",
    },
    {
      id: "draft-library",
      label: "Library 草稿",
      description: "尚未完成 readiness 或發布的資源文章。",
      count: counts.draftLibraryEntries,
      href: "/admin/library",
      tone: "work",
    },
    {
      id: "draft-skills",
      label: "Skill 草稿",
      description: "尚未完成 Release、artifact 或發布的 Skill。",
      count: counts.draftSkills,
      href: "/admin/skills",
      tone: "work",
    },
    {
      id: "draft-information",
      label: "Information 草稿",
      description: "尚待確認內容、對象或發布的公告。",
      count: counts.draftInformation,
      href: "/admin/information?view=active&status=draft",
      tone: "work",
    },
  ] satisfies AdminOperationItem[]).filter((item) => item.count === null || item.count > 0);

  const unavailableSignals = adminOperationSignalIds.filter((signal) => counts[signal] === null);
  const complete = unavailableSignals.length === 0;

  return {
    urgent,
    work,
    total: complete
      ? Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null,
    status: complete ? "ok" : "degraded",
    completeness: complete ? "complete" : "partial",
    unavailableSignals,
    observedAt: new Date().toISOString(),
  };
}

export async function loadAdminOperationsCounts(
  loaders: AdminOperationsSignalLoaders,
): Promise<AdminOperationsCounts> {
  const results = await Promise.all(adminOperationSignalIds.map(async (signal) => {
    try {
      const value = await loaders[signal]();
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid signal count");
      return [signal, value] as const;
    } catch {
      logger.warn("Admin operation signal unavailable", { signal });
      return [signal, null] as const;
    }
  }));
  return Object.fromEntries(results) as AdminOperationsCounts;
}

async function countSignal(query: () => Promise<{ total: number }[]>): Promise<number> {
  const [result] = await query();
  if (!result) throw new Error("Admin operation count query returned no row");
  return Number(result.total);
}

export async function getAdminOperationsOverview(): Promise<AdminOperationsOverview> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const counts = await loadAdminOperationsCounts({
    deadWebhookDeliveries: () => countSignal(() => db.select({ total: count() }).from(webhookLogs)
      .where(eq(webhookLogs.status, "dead_letter"))),
    deadEntitlementTransitions: () => countSignal(() => db.select({ total: count() }).from(entitlementOutbox)
      .where(eq(entitlementOutbox.status, "dead_letter"))),
    orphanedMedia: () => countSignal(() => db.select({ total: count() }).from(media)
      .where(eq(media.status, "orphaned"))),
    oldPendingOrders: () => countSignal(() => db.select({ total: count() }).from(orders)
      .where(and(
        eq(orders.status, "pending"),
        sql`${orders.createdAt} < ${cutoff24h}`,
      ))),
    draftCourses: () => countSignal(() => db.select({ total: count() }).from(courses)
      .where(and(eq(courses.status, "draft"), isNull(courses.deletedAt)))),
    draftLibraryEntries: () => countSignal(() => db.select({ total: count() }).from(libraryEntries)
      .where(eq(libraryEntries.status, "draft"))),
    draftSkills: () => countSignal(() => db.select({ total: count() }).from(skills)
      .where(eq(skills.status, "draft"))),
    draftInformation: () => countSignal(() => db.select({ total: count() }).from(agentInformationItems)
      .where(eq(agentInformationItems.status, "draft"))),
    incompleteActivePlans: async () => {
      // Keep the operations overview bounded. The plans admin projection expands
      // delivery status per plan, which is useful for the table but far too
      // expensive for a single aggregate signal.
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM plans p
        WHERE p.status = 'active'
          AND (
            NOT EXISTS (
              SELECT 1 FROM plan_presentations pp
              WHERE pp.plan_id = p.id AND pp.published_at IS NOT NULL
            )
            OR NOT (
              EXISTS (
                SELECT 1 FROM plan_courses pc
                WHERE pc.plan_id = p.id AND pc.removed_at IS NULL
              )
              OR EXISTS (
                SELECT 1 FROM plan_contents pc
                WHERE pc.plan_id = p.id AND pc.deleted_at IS NULL
              )
              OR EXISTS (
                SELECT 1 FROM service_configs sc
                WHERE sc.plan_id = p.id AND sc.is_active = true AND sc.deleted_at IS NULL
              )
            )
          )
      `);
      const total = Number((result.rows[0] as { total?: number } | undefined)?.total);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid incomplete plan count");
      return total;
    },
  });

  return buildAdminOperationsOverview(counts);
}
