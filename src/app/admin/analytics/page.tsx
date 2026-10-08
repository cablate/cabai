import { db } from "@/lib/db";
import { eventsRaw, orders, plans } from "@/lib/db/schema";
import { count, countDistinct, eq, and, gte, sql, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import {
  getAgentAdoptionOverview,
  type AgentAdoptionCohort,
} from "@/lib/analytics/agent-adoption";

export const dynamic = "force-dynamic";

// ─── Event funnel definition ───

const FUNNEL_EVENTS = [
  "product_viewed",
  "product_cta_clicked",
  "checkout_started",
  "purchase_completed",
  "lead_magnet_claimed",
  "resource_downloaded",
  "lesson_completed",
] as const;

// ─── Helpers ───

function dateDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function fmtPct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  if (numerator === 0) return "0%";
  const v = (numerator / denominator) * 100;
  return v < 0.1 ? "<0.1%" : `${v.toFixed(1)}%`;
}

function fmtCount(n: number): string {
  return n.toLocaleString("zh-TW");
}

// ─── Queries ───

async function getEventCountsSince(since: Date) {
  const rows = await db
    .select({ eventType: eventsRaw.eventType, count: count() })
    .from(eventsRaw)
    .where(gte(eventsRaw.occurredAt, since))
    .groupBy(eventsRaw.eventType);

  return new Map(rows.map((r) => [r.eventType, Number(r.count)]));
}

async function getEventCountsAllTime() {
  const rows = await db
    .select({ eventType: eventsRaw.eventType, count: count() })
    .from(eventsRaw)
    .groupBy(eventsRaw.eventType);

  return new Map(rows.map((r) => [r.eventType, Number(r.count)]));
}

async function getPlanNames(): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: plans.id, name: plans.name })
    .from(plans);
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function getTopProductsByViews(since: Date, planNames: Map<string, string>, limit = 5) {
  const rows = await db
    .select({
      planId: sql<string>`properties->>'planId'`,
      count: count(),
    })
    .from(eventsRaw)
    .where(
      and(
        eq(eventsRaw.eventType, "product_viewed"),
        eq(eventsRaw.source, "web"),
        gte(eventsRaw.occurredAt, since),
        sql`properties->>'planId' IS NOT NULL`,
      ),
    )
    .groupBy(sql`properties->>'planId'`)
    .orderBy(desc(sql`count`))
    .limit(limit);

  return rows.map((r) => ({
    planId: r.planId,
    planName: planNames.get(r.planId) ?? r.planId.slice(0, 12) + "…",
    count: Number(r.count),
  }));
}

async function getTopCtaProducts(since: Date, planNames: Map<string, string>, limit = 5) {
  const rows = await db
    .select({
      planId: sql<string>`properties->>'planId'`,
      count: count(),
    })
    .from(eventsRaw)
    .where(
      and(
        eq(eventsRaw.eventType, "product_cta_clicked"),
        eq(eventsRaw.source, "web"),
        gte(eventsRaw.occurredAt, since),
        sql`properties->>'planId' IS NOT NULL`,
      ),
    )
    .groupBy(sql`properties->>'planId'`)
    .orderBy(desc(sql`count`))
    .limit(limit);

  return rows.map((r) => ({
    planId: r.planId,
    planName: planNames.get(r.planId) ?? r.planId.slice(0, 12) + "…",
    count: Number(r.count),
  }));
}

interface FunnelData {
  viewed: number;
  cta: number;
  checkoutStarted: number;
}

interface PurchaseOutcomeData {
  paymentCallbacks: number;
  marketplaceImports: number;
  completedOrders: number;
}

async function getCheckoutFunnel(since: Date): Promise<FunnelData> {
  const runQuery = async (
    eventType: string,
    source: "web" | "server",
  ) => {
    const [result] = await db
      .select({ count: countDistinct(eventsRaw.userId) })
      .from(eventsRaw)
      .where(
        and(
          eq(eventsRaw.eventType, eventType),
          eq(eventsRaw.source, source),
          gte(eventsRaw.occurredAt, since),
        ),
      );
    return Number(result?.count ?? 0);
  };

  return {
    viewed: await runQuery("product_viewed", "web"),
    cta: await runQuery("product_cta_clicked", "web"),
    checkoutStarted: await runQuery("checkout_started", "server"),
  };
}

async function getPurchaseOutcomes(since: Date): Promise<PurchaseOutcomeData> {
  const countPurchaseEvents = async (
    source: "payment_callback" | "marketplace_import",
  ) => {
    const [result] = await db
      .select({ count: count() })
      .from(eventsRaw)
      .where(
        and(
          eq(eventsRaw.eventType, "purchase_completed"),
          eq(eventsRaw.source, source),
          gte(eventsRaw.occurredAt, since),
        ),
      );
    return Number(result?.count ?? 0);
  };

  const [completedOrders] = await db
    .select({ count: count() })
    .from(orders)
    .where(
      and(eq(orders.status, "completed"), gte(orders.updatedAt, since)),
    );

  return {
    paymentCallbacks: await countPurchaseEvents("payment_callback"),
    marketplaceImports: await countPurchaseEvents("marketplace_import"),
    completedOrders: Number(completedOrders?.count ?? 0),
  };
}

// ─── Page ───

export default async function AnalyticsPage() {
  const thisWeek = dateDaysAgo(7);
  const thisMonth = dateDaysAgo(30);
  const now = new Date();

  const planNames = await getPlanNames();

  const [
    weekEvents,
    monthEvents,
    allTimeEvents,
    topViewed,
    topCta,
    funnelWeek,
    funnelMonth,
    outcomesWeek,
    outcomesMonth,
    agentAdoption,
  ] =
    await Promise.all([
      getEventCountsSince(thisWeek),
      getEventCountsSince(thisMonth),
      getEventCountsAllTime(),
      getTopProductsByViews(thisWeek, planNames),
      getTopCtaProducts(thisWeek, planNames),
      getCheckoutFunnel(thisWeek),
      getCheckoutFunnel(thisMonth),
      getPurchaseOutcomes(thisWeek),
      getPurchaseOutcomes(thisMonth),
      getAgentAdoptionOverview(now),
    ]);

  const totalAllTime = allTimeEvents.size > 0
    ? Array.from(allTimeEvents.values()).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="數據分析"
        description="分開呈現登入使用者的站內互動，以及付款與匯入產生的交易結果。"
      />
      <div className="-mt-6 mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>更新時間：{now.toLocaleString("zh-TW")}</span>
        <span>累計事件：{fmtCount(totalAllTime)}</span>
        {totalAllTime === 0 && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
            tracking 剛啟用，資料需幾天累積
          </span>
        )}
      </div>

      {/* ─── Funnel ─── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          登入使用者的站內路徑
        </h2>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-text-secondary">
          只計算可識別的第一方登入事件，數字是去重使用者數。公開匿名流量目前不在這個母體中，因此不拿來和交易結果直接相除。
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FunnelCard title="近 7 天" funnel={funnelWeek} />
          <FunnelCard title="近 30 天" funnel={funnelMonth} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          交易結果
        </h2>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-text-secondary">
          Callback、Marketplace 匯入與訂單狀態是不同來源。它們可用來確認交易結果，但不代表使用者一定走過本站商品頁與 CTA。
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PurchaseOutcomeCard title="近 7 天" outcomes={outcomesWeek} />
          <PurchaseOutcomeCard title="近 30 天" outcomes={outcomesMonth} />
        </div>
      </section>

      <section aria-labelledby="agent-adoption-heading">
        <h2
          id="agent-adoption-heading"
          className="mb-4 text-lg font-semibold text-text-primary"
        >
          Agent API 採用
        </h2>
        <p className="mb-4 max-w-3xl text-sm leading-6 text-text-secondary">
          以使用者第一次建立 User Agent Key 的時間歸入 cohort，並以使用者去重。有效 Key
          曾被使用不代表特定內容取得成功；ACK 也不代表內容已被閱讀或理解。
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AgentAdoptionCard
            title="近 30 天首次建立 Key"
            cohort={agentAdoption.last30Days}
          />
          <AgentAdoptionCard
            title="全部 User Agent 使用者"
            cohort={agentAdoption.allTime}
          />
        </div>
      </section>

      {/* ─── Event totals ─── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          事件總覽
        </h2>
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-muted text-left">
                <th className="px-5 py-3 font-medium text-text-muted">事件</th>
                <th className="px-5 py-3 font-medium text-text-muted">近 7 天</th>
                <th className="px-5 py-3 font-medium text-text-muted">近 30 天</th>
                <th className="px-5 py-3 font-medium text-text-muted">全部</th>
              </tr>
            </thead>
            <tbody>
              {FUNNEL_EVENTS.map((evt) => (
                <tr key={evt} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-5 py-3 font-medium text-text-primary">
                    <EventLabel eventType={evt} />
                  </td>
                  <td className="px-5 py-3 font-mono text-text-secondary">
                    {fmtCount(weekEvents.get(evt) ?? 0)}
                  </td>
                  <td className="px-5 py-3 font-mono text-text-secondary">
                    {fmtCount(monthEvents.get(evt) ?? 0)}
                  </td>
                  <td className="px-5 py-3 font-mono text-text-secondary">
                    {fmtCount(allTimeEvents.get(evt) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Top products ─── */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          熱門方案（近 7 天）
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
            <div className="border-b border-border-subtle bg-surface-muted px-5 py-3 text-xs font-semibold uppercase text-text-muted">
              瀏覽數最多
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left">
                  <th className="px-5 py-2.5 font-medium text-text-muted">方案</th>
                  <th className="px-5 py-2.5 font-medium text-text-muted">瀏覽</th>
                </tr>
              </thead>
              <tbody>
                {topViewed.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-6 text-center text-sm text-text-muted">
                      尚無瀏覽紀錄
                    </td>
                  </tr>
                ) : (
                  topViewed.map((row, i) => (
                    <tr key={row.planId} className="border-b border-border-subtle last:border-b-0">
                      <td className="px-5 py-2.5 text-sm text-text-primary">
                        <span className="mr-2 text-xs text-text-muted">#{i + 1}</span>
                        {row.planName}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-sm text-text-secondary">
                        {fmtCount(row.count)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
            <div className="border-b border-border-subtle bg-surface-muted px-5 py-3 text-xs font-semibold uppercase text-text-muted">
              CTA 點擊最多
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left">
                  <th className="px-5 py-2.5 font-medium text-text-muted">方案</th>
                  <th className="px-5 py-2.5 font-medium text-text-muted">點擊</th>
                </tr>
              </thead>
              <tbody>
                {topCta.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-6 text-center text-sm text-text-muted">
                      尚無點擊紀錄
                    </td>
                  </tr>
                ) : (
                  topCta.map((row, i) => (
                    <tr key={row.planId} className="border-b border-border-subtle last:border-b-0">
                      <td className="px-5 py-2.5 text-sm text-text-primary">
                        <span className="mr-2 text-xs text-text-muted">#{i + 1}</span>
                        {row.planName}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-sm text-text-secondary">
                        {fmtCount(row.count)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───

function FunnelCard({ title, funnel }: { title: string; funnel: FunnelData }) {
  const ctaRate =
    funnel.viewed > 0 && funnel.cta <= funnel.viewed
      ? fmtPct(funnel.cta, funnel.viewed)
      : undefined;
  const checkoutRate =
    funnel.cta > 0 && funnel.checkoutStarted <= funnel.cta
      ? fmtPct(funnel.checkoutStarted, funnel.cta)
      : undefined;
  const coverageWarning =
    funnel.cta > funnel.viewed || funnel.checkoutStarted > funnel.cta;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="space-y-3">
        <FunnelRow label="商品頁瀏覽" count={funnel.viewed} />
        <FunnelArrow />
        <FunnelRow
          label="CTA 點擊"
          count={funnel.cta}
          rate={ctaRate}
        />
        <FunnelArrow />
        <FunnelRow
          label="Checkout 開始"
          count={funnel.checkoutStarted}
          rate={checkoutRate}
        />
        {coverageWarning && (
          <p className="text-xs leading-5 text-amber-700">
            部分使用者缺少較前段事件，因此這個期間不顯示可能誤導的轉換率。
          </p>
        )}
      </div>
    </div>
  );
}

function PurchaseOutcomeCard({
  title,
  outcomes,
}: {
  title: string;
  outcomes: PurchaseOutcomeData;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="space-y-3">
        <FunnelRow label="付款 callback 紀錄" count={outcomes.paymentCallbacks} />
        <FunnelRow label="Marketplace 匯入紀錄" count={outcomes.marketplaceImports} />
        <FunnelRow
          label="目前完成訂單"
          count={outcomes.completedOrders}
          note="依訂單最後更新時間統計；這是交易狀態，不是漏斗轉換率。"
        />
      </div>
    </div>
  );
}

function AgentAdoptionCard({
  title,
  cohort,
}: {
  title: string;
  cohort: AgentAdoptionCohort;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="space-y-3">
        <FunnelRow label="建立 User Agent Key" count={cohort.created} />
        <FunnelArrow />
        <FunnelRow
          label="有效 Key 曾被使用"
          count={cohort.used}
          rate={fmtPct(cohort.used, cohort.created)}
        />
        <FunnelArrow />
        <FunnelRow
          label="至少 ACK 一則 Information"
          count={cohort.acknowledged}
          rate={fmtPct(cohort.acknowledged, cohort.used)}
        />
      </div>
    </div>
  );
}

function FunnelRow({
  label,
  count,
  rate,
  note,
}: {
  label: string;
  count: number;
  rate?: string;
  note?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">{label}</span>
        <div className="flex items-center gap-3">
          {rate && (
            <span className={`text-xs font-medium ${rate === "0%" ? "text-text-muted" : "text-emerald-600"}`}>
              {rate}
            </span>
          )}
          <span className="font-mono text-sm font-semibold text-text-primary tabular-nums">
            {fmtCount(count)}
          </span>
        </div>
      </div>
      {note && (
        <p className="mt-0.5 text-xs text-amber-600">{note}</p>
      )}
    </div>
  );
}

function FunnelArrow() {
  return (
    <div className="flex justify-center">
      <span className="text-xs text-text-muted/30">
        ↓
      </span>
    </div>
  );
}

function EventLabel({ eventType }: { eventType: string }) {
  const labels: Record<string, string> = {
    product_viewed: "商品頁瀏覽",
    product_cta_clicked: "CTA 點擊",
    checkout_started: "Checkout 開始",
    purchase_completed: "完成付款",
    lead_magnet_claimed: "免費資源領取",
    resource_downloaded: "資源下載",
    lesson_completed: "課堂完成",
  };
  return labels[eventType] ?? eventType;
}
