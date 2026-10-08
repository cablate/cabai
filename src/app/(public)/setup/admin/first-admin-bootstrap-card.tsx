"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { BRAND_INITIAL } from "@/lib/constants";

const ADMIN_DESTINATION = "/admin";

export function FirstAdminBootstrapCard({ enabled }: { enabled: boolean }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await signIn("bootstrap", {
        email,
        token,
        redirect: false,
        callbackUrl: ADMIN_DESTINATION,
      });

      if (result?.ok) {
        window.location.assign(ADMIN_DESTINATION);
        return;
      }

      setError("設定失敗：token 無效、尚未啟用，或第一位管理員已完成設定。");
    } catch {
      setError("設定失敗，請確認部署設定後再試一次。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-10 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
            <span className="text-sm font-bold text-white">{BRAND_INITIAL}</span>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">首次管理員設定</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            這是自架站點的一次性初始化入口，不會取代日常 Google 登入。
          </p>
        </div>

        {!enabled ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              首次管理員設定目前未啟用。請先設定 ADMIN_BOOTSTRAP_TOKEN，或使用既有登入流程。
            </p>
            <Link prefetch={false}
              href="/login"
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-200 px-5 py-3.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              回到 Google 登入
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="first-admin-email" className="mb-2 block text-sm font-medium text-zinc-800">
                管理員 email
              </label>
              <input
                id="first-admin-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                required
                aria-describedby="first-admin-email-help"
                className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none transition-[background-color,border-color,box-shadow] hover:border-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
              <p id="first-admin-email-help" className="mt-2 text-xs leading-relaxed text-zinc-500">
                可填既有使用者 email；若不存在，系統會建立管理員帳號。
              </p>
            </div>

            <div>
              <label htmlFor="first-admin-token" className="mb-2 block text-sm font-medium text-zinc-800">
                初始化權杖
              </label>
              <div className="flex gap-2">
                <input
                  id="first-admin-token"
                  name="token"
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  minLength={32}
                  required
                  aria-describedby="first-admin-token-help"
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 font-mono text-base text-zinc-900 outline-none transition-[background-color,border-color,box-shadow] hover:border-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((visible) => !visible)}
                  aria-pressed={showToken}
                  aria-label={showToken ? "隱藏初始化權杖" : "顯示初始化權杖"}
                  className="min-h-12 shrink-0 rounded-xl border border-zinc-300 px-3 text-xs font-medium text-zinc-600 transition-[background-color,border-color,transform] hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.98]"
                >
                  {showToken ? "隱藏" : "顯示"}
                </button>
              </div>
              <p id="first-admin-token-help" className="mt-2 text-xs leading-relaxed text-zinc-500">
                token 只會透過安全 POST 傳送，請不要貼到 URL 或聊天訊息。
              </p>
            </div>

            {error ? (
              <p role="alert" aria-live="polite" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-zinc-900 px-5 py-3.5 text-sm font-medium text-white transition-[background-color,transform] hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? "設定中…" : "建立第一位管理員"}
            </button>

            <p className="text-center text-xs leading-relaxed text-zinc-400">
              完成後請移除部署中的 ADMIN_BOOTSTRAP_TOKEN。
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
