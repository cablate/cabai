"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession, signOut } from "next-auth/react";
import {
  BookOpen,
  Receipt,
  UserCircle,
  SignOut,
  Robot,
} from "@phosphor-icons/react";

const memberTabs = [
  { href: "/dashboard", label: "我的內容", short: "內容", icon: BookOpen },
  { href: "/dashboard/orders", label: "訂單紀錄", short: "訂單", icon: Receipt },
  { href: "/dashboard/profile", label: "個人資料", short: "個人", icon: UserCircle },
  { href: "/dashboard/settings/agent", label: "Agent 串接", short: "Agent", icon: Robot },
];

export function MemberSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ─── Desktop sidebar ─── */}
      <aside className="hidden md:flex md:flex-col md:gap-1">
        <nav className="sticky top-28 flex flex-col gap-0.5">
          <p className="mb-3 px-3 text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Member Center
          </p>
          {memberTabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link prefetch={false}
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]",
                  active
                    ? "bg-surface-muted font-medium text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                    : "text-text-secondary hover:bg-surface-muted/50 hover:text-text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >
                <tab.icon
                  size={18}
                  weight={active ? "fill" : "duotone"}
                  className={cn(
                    active ? "text-text-primary" : "text-text-muted",
                  )}
                />
                {tab.label}
              </Link>
            );
          })}

          {session?.user && (
            <>
              <div className="my-3 border-t border-border-subtle" />
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-muted transition-all hover:bg-danger-light hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger active:scale-[0.98]"
              >
                <SignOut size={18} weight="bold" />
                登出
              </button>
            </>
          )}
        </nav>
      </aside>

      {/* ─── Mobile tabs ─── */}
      <nav className="mb-5 grid grid-cols-4 gap-1 rounded-2xl border border-border-subtle bg-surface/70 p-1 shadow-card md:hidden">
        {memberTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link prefetch={false}
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-2 text-xs font-medium transition-[background-color,color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]",
                active
                  ? "bg-surface-muted text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                  : "text-text-secondary hover:bg-surface-muted/50 hover:text-text-primary",
              )}
              aria-current={active ? "page" : undefined}
            >
              <tab.icon
                size={16}
                weight={active ? "fill" : "duotone"}
              />
              <span className="max-sm:hidden">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
