import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userPurchases, orders, webhookLogs } from "@/lib/db/schema";
import { eq, and, isNotNull, isNull, count, inArray } from "drizzle-orm";
import { getLocalPlans, type LocalPlan } from "@/lib/plans-local";
import { reconcileOrder } from "@/lib/reconcile";
import {
  ShoppingBag,
  ArrowRight,
  BookOpen,
  Gear,
  CalendarBlank,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import { getDeliveryOverviewForPlans } from "@/lib/delivery";
import { getPlanWithPresentation } from "@/lib/plan-presentations";
import { MemberOfferingCard } from "@/components/offerings/member-offering-card";
import { DashboardCard, type DashboardItem } from "./dashboard-card";
import { getLearnerCourseProgress } from "@/lib/queries/learner-course-progress";
import { LearningProgress } from "@/components/learning/learning-progress";

interface DashboardPageProps {
  searchParams: Promise<{ order?: string; status?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;

  // ─── P0: Reconcile on success redirect ───
  if (params.order && params.status === "success") {
    await reconcileOrder(params.order, session.user.id);
    redirect("/dashboard");
  }

  const isAdmin = session.user.role === "admin";

  // ─── Fetch data in parallel ───
  const [purchases, localPlans, activeSubscriptions] = await Promise.all([
    db
      .select()
      .from(userPurchases)
      .where(
        and(
          eq(userPurchases.userId, session.user.id),
          isNull(userPurchases.revokedAt),
        ),
      ),
    getLocalPlans(),
    db.select().from(orders).where(
      and(
        eq(orders.userId, session.user.id),
        isNotNull(orders.subscriptionId),
        eq(orders.status, "completed"),
      )
    ),
  ]);

  // Build plan lookup
  const planMap = new Map<string, LocalPlan>();
  localPlans.forEach((p) => planMap.set(p.id, p));

  // ─── Merge local purchases + local subscription orders ───
  const seenPlanIds = new Set<string>();
  const items: DashboardItem[] = [];

  if (isAdmin) {
    // Admin preview: show all plans as accessible
    for (const plan of localPlans) {
      items.push({
        id: `admin-${plan.id}`,
        planId: plan.id,
        plan,
        source: "local",
        grantedAt: new Date(),
      });
    }
  } else {
    for (const p of purchases) {
      seenPlanIds.add(p.planId);
      items.push({
        id: p.id,
        planId: p.planId,
        plan: planMap.get(p.planId),
        source: "local",
        grantedAt: p.grantedAt,
        expiresAt: p.expiresAt,
        orderId: p.orderId ?? undefined,
      });
    }

    for (const order of activeSubscriptions) {
      if (seenPlanIds.has(order.planId)) continue;
      if (order.subscriptionStatus !== "active" && order.subscriptionStatus !== "past_due" && !order.cancelAtPeriodEnd) continue;

      items.push({
        id: `sub-${order.id}`,
        planId: order.planId,
        plan: planMap.get(order.planId),
        source: "subscription",
        status: order.subscriptionStatus ?? undefined,
        nextBillingAt: order.nextBillingAt ?? undefined,
        cancelAtPeriodEnd: order.cancelAtPeriodEnd ?? undefined,
        orderId: order.id,
      });
    }
  }

  // ─── Provisioning status ───
  const orderIdMap = new Map<string, string>();
  for (const item of items) {
    let orderId = item.orderId;
    if (!orderId && item.source === "local") {
      const purchase = purchases.find((p) => p.id === item.id);
      orderId = purchase?.orderId ?? undefined;
    }
    if (orderId) orderIdMap.set(item.id, orderId);
  }

  const allOrderIds = [...new Set(orderIdMap.values())];
  if (allOrderIds.length > 0) {
    const allLogs = await db
      .select({
        orderId: webhookLogs.orderId,
        status: webhookLogs.status,
        cnt: count(),
      })
      .from(webhookLogs)
      .where(inArray(webhookLogs.orderId, allOrderIds))
      .groupBy(webhookLogs.orderId, webhookLogs.status);

    const logsByOrder = new Map<string, Record<string, number>>();
    for (const log of allLogs) {
      if (!log.orderId) continue;
      if (!logsByOrder.has(log.orderId)) logsByOrder.set(log.orderId, {});
      logsByOrder.get(log.orderId)![log.status] = log.cnt;
    }

    for (const item of items) {
      const orderId = orderIdMap.get(item.id);
      if (orderId && logsByOrder.has(orderId)) {
        const statusMap = logsByOrder.get(orderId)!;
        item.provisioning = {
          total: Object.values(statusMap).reduce((a, b) => a + b, 0),
          sent: statusMap.sent ?? 0,
          pending: (statusMap.pending ?? 0) + (statusMap.processing ?? 0) + (statusMap.failed ?? 0),
          deadLetter: statusMap.dead_letter ?? 0,
        };
      }
    }
  }

  // Fetch presentations
  const presentationByPlanId = new Map();
  const planIds = isAdmin
    ? localPlans.map(p => p.id)
    : purchases.map(p => p.planId);

  if (planIds.length > 0) {
    await Promise.all(
      planIds.map(async (planId) => {
        try {
          const { presentation } = await getPlanWithPresentation(planId);
          presentationByPlanId.set(planId, presentation);
        } catch {
          presentationByPlanId.set(planId, null);
        }
      })
    );
  }

  const deliveryByPlanId = await getDeliveryOverviewForPlans(
    items.map((item) => item.planId),
    session.user.id,
  );

  for (const item of items) {
    item.delivery = deliveryByPlanId.get(item.planId);
  }
  const courseLearningById = await getLearnerCourseProgress(
    [...deliveryByPlanId.values()].flatMap((delivery) => delivery.courses.map((course) => course.id)),
    session.user.id,
  );
  const continueLearning = [...deliveryByPlanId.values()]
    .flatMap((delivery) => delivery.courses)
    .map((course) => ({ course, summary: courseLearningById.get(course.id) }))
    .find(({ summary }) => summary && !summary.isCompleted && summary.orderedLessonIds.length > 0);

  // ─── Categorize by offering type ───
  // Admin: synthetic purchase-like objects for all plans
  const displayPurchases = isAdmin
    ? localPlans.map(plan => ({
        id: `admin-${plan.id}`,
        planId: plan.id,
        userId: session.user.id!,
        grantedAt: new Date(),
        expiresAt: null,
        orderId: null,
        grantedBy: "manual" as const,
        revokedAt: null,
        revokedBy: null,
      }))
    : purchases;

  const courseItems: typeof displayPurchases = [];
  const eventItems: typeof displayPurchases = [];
  const serviceItems: typeof displayPurchases = [];
  const otherItems: typeof displayPurchases = [];

  for (const p of displayPurchases) {
    const pres = presentationByPlanId.get(p.planId);
    const type = pres?.offeringType;
    if (type === "course") courseItems.push(p);
    else if (type === "lecture" || type === "free_event" || type === "offline_event") eventItems.push(p);
    else if (type === "service") serviceItems.push(p);
    else otherItems.push(p);
  }

  const typeLabel: Record<string, string> = {
    "one-time": "單次購買",
    monthly: "月訂閱",
    yearly: "年訂閱",
  };

  // ─── Lead magnet: detect free-only users for next-step recommendation ───
  const hasOnlyFreeResources =
    !isAdmin &&
    items.length > 0 &&
    purchases.every(
      (p) =>
        p.grantedBy === "free_claim" ||
        (presentationByPlanId.get(p.planId)?.offeringType === "free_event"),
    );

  // Load paid plan presentations for recommendation
  const paidPlanRecommendations: Array<{ plan: LocalPlan; presentation: typeof presentationByPlanId extends Map<string, infer V> ? V : never }> = [];
  if (hasOnlyFreeResources) {
    const paidPlans = localPlans.filter(
      (p) =>
        p.status === "active" &&
        p.amount > 0 &&
        (p.purchaseButtonMode === "internal" || p.purchaseButtonMode === "external"),
    );
    const recommended = paidPlans.slice(0, 3);
    for (const plan of recommended) {
      try {
        const { presentation } = await getPlanWithPresentation(plan.id);
        paidPlanRecommendations.push({ plan, presentation });
      } catch {
        // skip plans without presentation
      }
    }
  }

  return (
    <>

      <div className="mb-6 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-text-muted">
            我的內容
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
            {session.user.name
              ? `${session.user.name} 的學習與交付`
              : "你的學習與交付"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
            已解鎖的課程會集中在這裡。
          </p>
        </div>
        {items.length > 0 && (
          <Link prefetch={false}
            href="/products"
            className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-muted hover:text-text-primary active:scale-[0.98]"
          >
            探索更多課程
            <ArrowRight size={14} weight="bold" />
          </Link>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="flex flex-col items-start justify-center rounded-3xl border border-border-subtle bg-surface p-8 shadow-card sm:p-10">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted">
            <ShoppingBag size={26} weight="duotone" className="text-text-muted" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-text-primary">
            目前還沒有解鎖的內容
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">
            完成購買或領取免費資源後，課程會出現在這裡。
          </p>
          <Link prefetch={false}
            href="/products"
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-text-primary px-6 py-3 text-sm font-medium text-text-inverted transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 active:scale-[0.98]"
          >
            探索課程
            <ArrowRight size={15} weight="bold" />
          </Link>
        </div>
      ) : (
        <div className="space-y-10">

          {continueLearning?.summary && (
            <section className="grid gap-5 border-y border-border-subtle py-6 sm:grid-cols-[1fr_auto] sm:items-center sm:py-8" aria-labelledby="continue-learning-title">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-widest text-text-muted">繼續學習</p>
                <h2 id="continue-learning-title" className="mt-2 text-xl font-semibold tracking-tight text-text-primary">
                  {continueLearning.course.title}
                </h2>
                {continueLearning.summary.resumeLessonTitle && (
                  <p className="mt-1 truncate text-sm text-text-secondary">
                    下一堂：{continueLearning.summary.resumeLessonTitle}
                  </p>
                )}
                <div className="mt-4 max-w-xl">
                  <LearningProgress completed={continueLearning.summary.completedLessonCount} total={continueLearning.summary.orderedLessonIds.length} />
                </div>
              </div>
              <Link prefetch={false} href={continueLearning.summary.resumeHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-text-primary px-6 py-3 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 active:scale-[0.98]">
                前往下一堂
                <ArrowRight size={15} weight="bold" />
              </Link>
            </section>
          )}

          {/* ─── Insight cards ─── */}
          {/*
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <InsightCard
              icon={BookOpen}
              label="課程"
              value={courseItems.length}
              accent="emerald"
            />
            <InsightCard
              icon={Ticket}
              label="活動 / 票券"
              value={eventItems.length}
              accent="amber"
            />
            <InsightCard
              icon={Gear}
              label="服務中"
              value={serviceItems.length}
              accent="blue"
            />
            <InsightCard
              icon={CreditCard}
              label="訂閱中"
              value={activeSubscriptions.filter(o =>
                o.subscriptionStatus === "active"
              ).length}
              accent="violet"
            />
          </div>
          */}

            {/* ─── Free user next-step recommendation ─── */}
            {hasOnlyFreeResources && paidPlanRecommendations.length > 0 && (
              <section className="rounded-2xl border border-border-subtle bg-surface p-6 md:p-8">
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light">
                    <ArrowRight size={20} weight="duotone" className="text-accent" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      看完免費資源後，下一步？
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      下列進階內容能幫你更有系統地建立 Agent 開發能力
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {paidPlanRecommendations.map(({ plan: recPlan, presentation }) => {
                    const presTitle = presentation?.title || recPlan.name;
                    const presImage = presentation?.coverImage || recPlan.image;
                    const planSlug = recPlan.slug || recPlan.id;
                    return (
                      <Link prefetch={false}
                        key={recPlan.id}
                        href={`/products/${planSlug}`}
                        className="group flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface transition-all duration-300 hover:border-accent hover:shadow-card"
                      >
                        {presImage && (
                          <div className="relative aspect-[16/9] overflow-hidden bg-surface-muted">
                            <Image
                              src={presImage}
                              alt={presTitle}
                              fill
                              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            />
                          </div>
                        )}
                        <div className="flex flex-1 flex-col p-5">
                          <h3 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-accent">
                            {presTitle}
                          </h3>
                          {recPlan.description && (
                            <p className="mt-2 flex-1 text-xs text-text-secondary leading-relaxed line-clamp-2">
                              {recPlan.description}
                            </p>
                          )}
                          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-accent">
                            了解更多
                            <ArrowRight size={12} weight="bold" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ─── Courses ─── */}
            {courseItems.length > 0 && (
              <DashboardSection
                title="我的課程"
                icon={BookOpen}
              >
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {courseItems.map((purchase) => {
                    const plan = planMap.get(purchase.planId);
                    const presentation = presentationByPlanId.get(purchase.planId);
                    if (!plan) return null;
                    return (
                      <MemberOfferingCard
                        key={purchase.id}
                        plan={plan}
                        presentation={presentation}
                        purchase={purchase}
                        isExpired={!!(purchase.expiresAt && purchase.expiresAt < new Date())}
                        learningSummary={
                          deliveryByPlanId.get(purchase.planId)?.courses
                            .map((course) => courseLearningById.get(course.id))
                            .find((summary) => summary && !summary.isCompleted) ??
                          deliveryByPlanId.get(purchase.planId)?.courses
                            .map((course) => courseLearningById.get(course.id))
                            .find(Boolean)
                        }
                      />
                    );
                  })}
                </div>
              </DashboardSection>
            )}

            {/* ─── Events / Tickets ─── */}
            {eventItems.length > 0 && (
              <DashboardSection
                title="活動與票券"
                icon={CalendarBlank}
              >
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {eventItems.map((purchase) => {
                    const plan = planMap.get(purchase.planId);
                    const presentation = presentationByPlanId.get(purchase.planId);
                    if (!plan) return null;
                    return (
                      <MemberOfferingCard
                        key={purchase.id}
                        plan={plan}
                        presentation={presentation}
                        purchase={purchase}
                        isExpired={!!(purchase.expiresAt && purchase.expiresAt < new Date())}
                      />
                    );
                  })}
                </div>
              </DashboardSection>
            )}

            {/* ─── Services ─── */}
            {serviceItems.length > 0 && (
              <DashboardSection
                title="服務狀態"
                icon={Gear}
              >
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {serviceItems.map((purchase) => {
                    const plan = planMap.get(purchase.planId);
                    const presentation = presentationByPlanId.get(purchase.planId);
                    if (!plan) return null;
                    return (
                      <MemberOfferingCard
                        key={purchase.id}
                        plan={plan}
                        presentation={presentation}
                        purchase={purchase}
                        isExpired={!!(purchase.expiresAt && purchase.expiresAt < new Date())}
                      />
                    );
                  })}
                </div>
              </DashboardSection>
            )}

            {/* ─── Other / uncategorized ─── */}
            {otherItems.length > 0 && (
              <DashboardSection title="其他內容">
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {otherItems.map((purchase) => {
                    const plan = planMap.get(purchase.planId);
                    const presentation = presentationByPlanId.get(purchase.planId);
                    if (!plan) return null;
                    return (
                      <MemberOfferingCard
                        key={purchase.id}
                        plan={plan}
                        presentation={presentation}
                        purchase={purchase}
                        isExpired={!!(purchase.expiresAt && purchase.expiresAt < new Date())}
                      />
                    );
                  })}
                </div>
              </DashboardSection>
            )}

            {/* ─── Legacy subscriptions ─── */}
            {items.filter(i => i.source === "subscription" && !purchases.some(p => p.planId === i.planId)).length > 0 && (
              <DashboardSection title="訂閱管理">
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {items.filter(i => i.source === "subscription" && !purchases.some(p => p.planId === i.planId)).map((item) => (
                    <DashboardCard key={item.id} item={item} typeLabel={typeLabel} />
                  ))}
                </div>
              </DashboardSection>
            )}
          </div>
        )}
    </>
  );
}

// ─── Dashboard section ───

function DashboardSection({
  title,
  icon: Icon,
  actionLabel,
  actionHref,
  children,
}: {
  title: string;
  icon?: typeof BookOpen;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between border-t border-border-subtle pt-6">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon size={18} weight="duotone" className="text-text-muted" />
          )}
          {!Icon && (
            <Sparkle size={18} weight="duotone" className="text-text-muted" />
          )}
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        </div>
        {actionLabel && actionHref && (
          <Link prefetch={false}
            href={actionHref}
            className="text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            {actionLabel} &rarr;
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
