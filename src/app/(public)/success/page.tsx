import Link from "next/link";
import { CheckCircle, ArrowUpRight, DiscordLogo, Clock, Receipt } from "@phosphor-icons/react/dist/ssr";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";
import { redirect } from "next/navigation";
import { getPlanWithPresentation, isPublicPlanPresentation } from "@/lib/plan-presentations";
import { getDeliveryOverviewForPlan } from "@/lib/delivery";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { orders, plans, userDiscordLinks, discordRoleMappings } from "@/lib/db/schema";
import type { PlanPresentation } from "@/lib/db/schema";
import type { DeliveryOverview } from "@/lib/delivery";
import type { Session } from "@auth/core/types";
import { reconcileOrder } from "@/lib/reconcile";
import { formatPrice } from "@/lib/utils";
import { planPath } from "@/lib/plan-url";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "付款結果",
  robots: { index: false, follow: false },
};

export default async function SuccessPage(props: {
  searchParams: Promise<{ order?: string; orderId?: string; planId?: string; status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { planId } = searchParams;
  const orderNumber = searchParams.order ?? searchParams.orderId;

  if (orderNumber) {
    const session = await auth();
    if (!session?.user?.id) {
      redirect(`/login?callbackUrl=/success?order=${encodeURIComponent(orderNumber)}&status=success`);
    }

    await reconcileOrder(orderNumber, session.user.id);

    const [order] = await db
      .select({
        id: orders.id,
        merchantOrderNumber: orders.merchantOrderNumber,
        status: orders.status,
        paidAmount: orders.paidAmount,
        expectedAmount: orders.expectedAmount,
        expectedCurrency: orders.expectedCurrency,
        planId: orders.planId,
        planName: plans.name,
        planSlug: plans.slug,
        billingPeriod: plans.billingPeriod,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .where(
        and(
          eq(orders.merchantOrderNumber, orderNumber),
          eq(orders.userId, session.user.id),
        ),
      )
      .limit(1);

    if (!order) {
      return <UnknownOrderSuccess orderNumber={orderNumber} />;
    }

    let presentation = null;
    try {
      const result = await getPlanWithPresentation(order.planId);
      presentation = result.presentation;
    } catch {
      // Keep the success handoff available even when presentation data is absent.
    }

    const delivery = await getDeliveryOverviewForPlan(order.planId, session.user.id);

    return (
      <OrderSuccessHandoff
        order={order}
        presentation={presentation}
        delivery={delivery}
      />
    );
  }

  // For now, show basic success page if no planId
  // This maintains backward compatibility
  if (!planId) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-24">
        <div className="w-full max-w-sm text-center">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50">
            <CheckCircle weight="duotone" className="h-8 w-8 text-emerald-500" />
          </div>

          {/* Eyebrow */}
          <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-medium uppercase text-emerald-600">
            付款結果
          </span>

          {/* Heading */}
          <h1 className="mt-4 text-3xl font-semibold text-zinc-900">
            請確認訂單狀態
          </h1>

          {/* Body */}
          <p className="mx-auto mt-3 max-w-[40ch] text-base leading-relaxed text-zinc-500">
            此頁連結無法確認付款。請登入會員中心查看實際訂單與內容權益。
          </p>

          {/* Divider */}
          <div className="my-8 h-px bg-zinc-100" />

          {/* CTA */}
          <Link prefetch={false}
            href="/dashboard"
            className="group inline-flex items-center gap-3 rounded-2xl bg-zinc-900 px-6 py-4 text-sm font-semibold text-white transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
          >
            <span>前往我的內容</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              <ArrowUpRight weight="bold" className="h-4 w-4" />
            </span>
          </Link>

          <Link prefetch={false}
            href="/dashboard/orders"
            className="mt-3 inline-flex rounded-sm text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            查看訂單記錄
          </Link>

          {/* Secondary link */}
          <p className="mt-4 text-xs text-zinc-400">
            需要協助？{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="rounded-sm underline underline-offset-2 transition-colors duration-300 hover:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              聯絡我們
            </a>
          </p>
        </div>
      </main>
    );
  }

  // Fetch presentation for type-aware rendering
  let presentation = null;
  try {
    const result = await getPlanWithPresentation(planId);
    if (!isPublicPlanPresentation(result.plan, result.presentation)) redirect("/");
    presentation = result.presentation;
  } catch {
    // If plan not found, redirect to home
    redirect("/");
  }

  const session = await auth();
  const delivery = await getDeliveryOverviewForPlan(planId, session?.user?.id);

  // Check if this plan has Discord role mappings and user hasn't linked yet
  const discordMappings = await db.query.discordRoleMappings.findMany({
    where: eq(discordRoleMappings.planId, planId),
    columns: { id: true },
    limit: 1,
  });
  const hasDiscordRoles = discordMappings.length > 0;
  let hasDiscordLink = false;
  if (session?.user?.id) {
    const link = await db.query.userDiscordLinks.findFirst({
      where: eq(userDiscordLinks.userId, session.user.id),
      columns: { id: true },
    });
    hasDiscordLink = !!link;
  }

  return (
    <SuccessHandoff
      planId={planId}
      presentation={presentation}
      delivery={delivery}
      session={session}
      hasDiscordRoles={hasDiscordRoles}
      hasDiscordLink={hasDiscordLink}
    />
  );
}

type OrderHandoff = {
  id: string;
  merchantOrderNumber: string;
  status: string;
  paidAmount: number | null;
  expectedAmount: number | null;
  expectedCurrency: string | null;
  planId: string;
  planName: string;
  planSlug: string | null;
  billingPeriod: string;
};

function OrderSuccessHandoff({
  order,
  presentation,
  delivery,
}: {
  order: OrderHandoff;
  presentation: PlanPresentation | null;
  delivery: DeliveryOverview;
}) {
  const completed = order.status === "completed";
  const title = presentation?.title ?? order.planName;
  const amount = order.paidAmount ?? order.expectedAmount;
  const primaryHref = completed
    ? delivery.primaryAction?.href ?? planPath({ id: order.planId, slug: order.planSlug }, "my")
    : "/dashboard/orders";
  const primaryLabel = completed ? "前往我的內容" : "查看訂單狀態";
  const refreshHref = `/success?order=${encodeURIComponent(order.merchantOrderNumber)}&status=success`;

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-zinc-50 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${
                completed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {completed ? (
                <CheckCircle weight="duotone" className="h-8 w-8" />
              ) : (
                <Clock weight="duotone" className="h-8 w-8" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-[10px] font-medium uppercase ${
                  completed
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {completed ? "付款已確認" : "付款確認中"}
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                {completed ? "已開通你的內容" : "正在確認你的付款"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {completed
                  ? "Portaly 付款已對回本站訂單。你購買的商品與交付入口如下。"
                  : "Portaly 已將你帶回本站，我們正在確認付款結果。若尚未自動開通，請稍後重新整理或到訂單紀錄查看。"}
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-start gap-3">
              <Receipt size={20} weight="duotone" className="mt-0.5 shrink-0 text-zinc-500" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-zinc-400">本站訂單商品</p>
                <p className="mt-1 text-base font-semibold text-zinc-950 [overflow-wrap:anywhere]">
                  {title}
                </p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">訂單編號</dt>
                    <dd className="mt-1 font-mono text-xs text-zinc-800">
                      {order.merchantOrderNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">金額</dt>
                    <dd className="mt-1 font-mono text-zinc-900">
                      {amount != null ? formatPrice(amount) : "-"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link prefetch={false}
              href={primaryHref}
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
            >
              <span>{primaryLabel}</span>
              <ArrowUpRight
                weight="bold"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
            {completed ? (
              <Link prefetch={false}
                href="/dashboard/orders"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition-[background-color,border-color,transform] hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
              >
                查看訂單紀錄
              </Link>
            ) : (
              <Link prefetch={false}
                href={refreshHref}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition-[background-color,border-color,transform] hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
              >
                重新確認
              </Link>
            )}
          </div>

          <p className="mt-5 text-xs leading-5 text-zinc-500">
            若 Portaly 付款頁顯示的是付款方案名稱，請以此頁的本站訂單商品為準。
          </p>
        </div>
      </div>
    </main>
  );
}

function UnknownOrderSuccess({ orderNumber }: { orderNumber: string }) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-zinc-50 px-6 py-24">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
          <Clock weight="duotone" className="h-8 w-8" />
        </div>
        <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[10px] font-medium uppercase text-amber-800">
          訂單確認中
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-950">尚未找到這筆本站訂單</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Portaly 已回到本站，但目前無法對應訂單 {orderNumber}。請到訂單紀錄查看，或聯繫我們協助確認。
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link prefetch={false}
            href="/dashboard/orders"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
          >
            查看訂單紀錄
          </Link>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition-[background-color,border-color,transform] hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
          >
            聯絡我們
          </a>
        </div>
      </div>
    </main>
  );
}

interface SuccessHandoffProps {
  planId: string;
  presentation: PlanPresentation | null;
  delivery: DeliveryOverview;
  session: Session | null;
  hasDiscordRoles: boolean;
  hasDiscordLink: boolean;
}

function SuccessHandoff({
  planId,
  presentation,
  delivery,
  hasDiscordRoles,
  hasDiscordLink,
}: SuccessHandoffProps) {
  const getPrimaryActionLabel = () => {
    if (!presentation) return "前往內容";

    switch (presentation.offeringType) {
      case "course":
        return "開始學習";
      case "lecture":
      case "free_event":
        return "查看講座";
      case "offline_event":
        return "查看票券";
      case "service":
        return "查看進度";
      case "membership":
        return "瀏覽會員內容";
      case "download":
        return "開始下載";
      default:
        return "前往內容";
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50">
          <CheckCircle weight="duotone" className="h-8 w-8 text-emerald-500" />
        </div>

        {/* Eyebrow */}
        <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-medium uppercase text-emerald-600">
          付款結果
        </span>

        {/* Heading */}
        <h1 className="mt-4 text-3xl font-semibold text-zinc-900">
          請確認訂單狀態
        </h1>

        {/* Offering title */}
        {presentation && (
          <p className="mx-auto mt-2 max-w-[40ch] text-base font-medium text-zinc-700">
            {presentation.title}
          </p>
        )}

        {/* Body — type-aware description */}
        <p className="mx-auto mt-3 max-w-[40ch] text-base leading-relaxed text-zinc-500">
          此頁連結無法確認付款或開通權益。請登入會員中心查看實際訂單與目前可用的內容。
        </p>

        {/* Discord guidance — only if plan has Discord roles and user hasn't linked yet */}
        {hasDiscordRoles && !hasDiscordLink && (
          <div className="mx-auto mt-6 max-w-xs rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-left">
            <div className="flex items-center gap-2">
              <DiscordLogo size={18} weight="fill" className="shrink-0 text-indigo-500" />
              <p className="text-sm font-medium text-indigo-900">
                連結 Discord 取得會員身分組
              </p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-indigo-600">
              此方案包含 Discord 會員專屬頻道。連結你的 Discord 帳號即可自動加入伺服器並取得付費身分組。
            </p>
            <Link prefetch={false}
              href="/api/discord/link"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-xs font-medium text-white transition-[background-color,transform] hover:bg-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 active:scale-[0.98]"
            >
              <DiscordLogo size={14} weight="fill" />
              連結 Discord
            </Link>
          </div>
        )}

        {/* Divider */}
        <div className="my-8 h-px bg-zinc-100" />

        {/* Primary CTA */}
        <Link prefetch={false}
          href={delivery?.primaryAction?.href || "/my/" + planId}
          className="group inline-flex items-center gap-3 rounded-2xl bg-zinc-900 px-6 py-4 text-sm font-semibold text-white transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
        >
          <span>{getPrimaryActionLabel()}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <ArrowUpRight weight="bold" className="h-4 w-4" />
          </span>
        </Link>

        <Link prefetch={false}
          href="/dashboard/orders"
          className="mt-3 inline-flex rounded-sm text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          查看訂單記錄
        </Link>

        {/* Secondary link */}
        <p className="mt-4 text-xs text-zinc-400">
          需要協助？{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="rounded-sm underline underline-offset-2 transition-colors duration-300 hover:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            聯絡我們
          </a>
        </p>
      </div>
    </main>
  );
}
