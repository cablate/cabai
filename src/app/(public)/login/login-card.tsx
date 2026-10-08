"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { GoogleLogo } from "@phosphor-icons/react";
import { BRAND_INITIAL } from "@/lib/constants";

export function LoginCard({ callbackUrl, googleEnabled }: { callbackUrl: string; googleEnabled: boolean }) {
  // Single-provider auto-redirect: skip the manual click and go straight
  // to Google OAuth. The card stays as a fallback if the redirect doesn't
  // fire (no-JS, popup blocker, signIn throws synchronously).
  const [autoRedirecting, setAutoRedirecting] = useState(googleEnabled);

  useEffect(() => {
    if (!googleEnabled) return;
    let cancelled = false;
    const showFallback = () => {
      if (!cancelled) setAutoRedirecting(false);
    };

    void signIn("google", { callbackUrl }).catch(showFallback);
    // signIn() doesn't resolve when it succeeds (page unloads), so we
    // fall back to showing the card after a short grace window in case
    // the redirect never started.
    const fallback = window.setTimeout(showFallback, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [callbackUrl, googleEnabled]);

  if (!googleEnabled) {
    return (
      <section className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-8 text-center" aria-labelledby="login-unavailable">
        <h1 id="login-unavailable" className="text-xl font-semibold text-foreground">會員登入尚未設定</h1>
        <p className="mt-3 text-sm text-text-muted">
          本站尚未啟用 Google 登入。你仍可閱讀公開內容；如需會員存取，請聯絡本站管理者。
        </p>
        <Link href="/" className="mt-6 inline-block text-accent underline">返回首頁</Link>
      </section>
    );
  }

  if (autoRedirecting) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
            <span className="text-sm font-bold text-white">{BRAND_INITIAL}</span>
          </div>
          <p className="text-sm leading-relaxed text-zinc-500">正在前往 Google 登入…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-10 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
            <span className="text-sm font-bold text-white">
              {BRAND_INITIAL}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">登入帳號</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
            使用 Google 帳號繼續
          </p>
        </div>

        <div className="mb-6 h-px bg-zinc-100" />

        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="group flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-3.5 text-sm font-medium text-zinc-700 transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
        >
          <span className="flex items-center gap-3">
            <GoogleLogo weight="bold" className="h-5 w-5 text-zinc-500" />
            使用 Google 帳號登入
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-zinc-200">
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-zinc-500"
            >
              <path
                d="M2 8L8 2M8 2H3M8 2V7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        <p className="mt-6 text-center text-xs leading-relaxed text-zinc-400">
          登入即代表你同意我們的服務條款與隱私政策
        </p>
      </div>
    </div>
  );
}
