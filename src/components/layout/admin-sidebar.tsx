"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BRAND_NAME } from "@/lib/constants";
import {
  SquaresFour,
  SignOut,
  List,
  X,
} from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ADMIN_NAV_SECTIONS,
  isAdminNavItemActive,
} from "@/components/layout/admin-navigation";

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    return isAdminNavItemActive(pathname, href);
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Link prefetch={false} href="/admin" className="rounded-sm text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          {BRAND_NAME}
          <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium text-white/54">管理員</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1.5 text-white/55 transition-[background-color,color,transform] hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.94] md:hidden"
          aria-label="關閉選單"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="管理後台">
        <Link prefetch={false}
          href="/admin"
          onClick={() => setMobileOpen(false)}
          className={`mb-5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] ${
            isActive("/admin")
              ? "bg-white text-ink"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          <SquaresFour
            size={18}
            weight={isActive("/admin") ? "fill" : "regular"}
            className={isActive("/admin") ? "text-accent" : "text-white/60"}
          />
          今日工作台
        </Link>

        {ADMIN_NAV_SECTIONS.map((section, sIdx) => (
          <div key={section.title} className={sIdx > 0 ? "mt-6" : ""}>
            <div className="mb-2 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                {section.title}
              </p>
              <p className="mt-0.5 text-[10px] text-white/55">{section.description}</p>
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link prefetch={false}
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] ${
                      active
                        ? "bg-white text-ink"
                        : "text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <item.icon
                      size={18}
                      weight={active ? "fill" : "regular"}
                      className={active ? "text-accent" : "text-white/60"}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/60 transition-[background-color,color,transform] hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
        >
          <SignOut size={18} className="text-white/60" />
          登出
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center border-b border-white/10 bg-ink px-4 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="rounded-md p-2 text-white/70 transition-[background-color,color,transform] hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.94]"
              aria-label="開啟管理選單"
            >
              <List size={24} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" aria-describedby={undefined}>
            <SheetTitle className="sr-only">管理選單</SheetTitle>
            {sidebarContent}
          </SheetContent>
        </Sheet>
        <span className="ml-3 text-sm font-semibold text-white">
          管理後台
        </span>
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-white/10 bg-ink md:flex">
        {sidebarContent}
      </aside>
    </>
  );
}
