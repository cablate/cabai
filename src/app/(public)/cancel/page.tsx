import Link from "next/link";
import { XCircle, ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";
import { getPlanWithPresentation, isPublicPlanPresentation } from "@/lib/plan-presentations";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "付款未完成",
  robots: { index: false, follow: false },
};

export default async function CancelPage(props: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { planId } = searchParams;

  let presentation = null;
  if (planId) {
    try {
      const result = await getPlanWithPresentation(planId);
      if (isPublicPlanPresentation(result.plan, result.presentation)) {
        presentation = result.presentation;
      }
    } catch {
      // Presentation not found, continue without it
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50">
          <XCircle weight="duotone" className="h-8 w-8 text-zinc-400" />
        </div>

        {/* Eyebrow */}
        <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-medium uppercase text-zinc-500">
          未完成付款
        </span>

        {/* Heading */}
        <h1 className="mt-4 text-3xl font-semibold text-zinc-900">
          您尚未被收費
        </h1>

        {/* Body */}
        <p className="mx-auto mt-3 max-w-[40ch] text-base leading-relaxed text-zinc-500">
          您已離開付款頁。這筆交易尚未成立，您的帳戶沒有被扣款。隨時可以返回繼續購買。
        </p>

        {/* Divider */}
        <div className="my-8 h-px bg-zinc-100" />

        {/* Primary CTA - back to offering if available */}
        {presentation && planId ? (
          <Link prefetch={false}
            href={`/products/${planId}`}
            className="group inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-6 py-4 text-sm font-semibold text-zinc-700 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-zinc-200">
              <ArrowLeft weight="bold" className="h-4 w-4 text-zinc-500" />
            </span>
            <span>返回「{presentation.title}」</span>
          </Link>
        ) : (
          <Link prefetch={false}
            href="/products"
            className="group inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-6 py-4 text-sm font-semibold text-zinc-700 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-zinc-200">
              <ArrowLeft weight="bold" className="h-4 w-4 text-zinc-500" />
            </span>
            <span>看看其他內容</span>
          </Link>
        )}

        {/* Secondary CTA - home */}
        <Link prefetch={false}
          href="/"
          className="mt-3 inline-flex rounded-sm text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          回到首頁
        </Link>

        {/* Support link */}
        <p className="mt-4 text-xs text-zinc-400">
          有任何問題？歡迎{" "}
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
