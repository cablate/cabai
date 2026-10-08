"use client";

import { PUBLIC_BRANDING } from "@/lib/config/public-branding";


import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/constants";
import { useSession, signOut } from "next-auth/react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  X,
  SignOut,
  ArrowRight,
  BookOpen,
  Receipt,
  UserCircle,
  House,
  Compass,
  UsersThree,
  Robot,
  GearSix,
  Books,
  BracketsCurly,
  Megaphone,
} from "@phosphor-icons/react";
import type { RefObject } from "react";
import {
  buildPublicNavItems,
  publicNavItemIsActive,
  type PublicContentAvailability,
  type PublicNavItem,
  type PublicNavKey,
} from "./public-navigation";

// ─── Shared nav data ───

const publicNavIcons: Record<PublicNavKey, typeof House> = {
  home: House,
  products: Compass,
  library: Books,
  skills: BracketsCurly,
  information: Megaphone,
  community: UsersThree,
};

const memberMenuItems = [
  { href: "/dashboard", label: "我的內容", icon: BookOpen },
  { href: "/dashboard/orders", label: "訂單紀錄", icon: Receipt },
  { href: "/dashboard/profile", label: "個人資料", icon: UserCircle },
  { href: "/dashboard/settings/agent", label: "Agent 串接", icon: Robot },
];

// ─── Props ───

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  contentAvailability: PublicContentAvailability;
}

// ─── Component ───

export function MobileDrawer({
  open,
  onClose,
  triggerRef,
  contentAvailability,
}: MobileDrawerProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const isLoading = status === "loading";
  const navItems = buildPublicNavItems(contentAvailability);
  const navGroups: Array<{ label: string; items: PublicNavItem[] }> = [
    { label: "起點", items: navItems.filter((item) => item.section === "primary") },
    { label: "探索內容", items: navItems.filter((item) => item.section === "discover") },
    { label: "更新與連結", items: navItems.filter((item) => item.section === "connect") },
  ].filter((group) => group.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <SheetTitle className="sr-only">導航選單</SheetTitle>
            {/* ─── Header area — brand + close ─── */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <Link prefetch={false}
                href="/"
                onClick={onClose}
                className="flex min-h-11 items-center gap-2.5 rounded-lg text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-md border border-white/18 bg-white/90">
                  <Image
                    src={PUBLIC_BRANDING.logo}
                    alt=""
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span>{BRAND_NAME}</span>
              </Link>
              <SheetClose
                className="flex size-11 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.96]"
                aria-label="關閉選單"
              >
                <X size={20} weight="bold" />
              </SheetClose>
            </div>

            {/* ─── Scrollable content ─── */}
            <div className="flex-1 overflow-y-auto px-4 py-5">
              {isLoading ? (
                /* Loading skeleton */
                <div className="animate-pulse space-y-3 motion-reduce:animate-none">
                  <div className="h-14 rounded-xl bg-white/8" />
                  <div className="h-10 rounded-xl bg-white/8" />
                  <div className="h-10 rounded-xl bg-white/8" />
                </div>
              ) : (
                <>
                  {/* User summary */}
                  {session?.user && (
                    <div className="mb-6 flex items-center gap-3 rounded-xl bg-white/8 px-4 py-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/20">
                        {session.user.image ? (
                          <Image
                            src={session.user.image}
                            alt=""
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <UserCircle size={20} className="text-white/50" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {session.user.name ?? "會員"}
                        </p>
                        <p className="truncate text-xs text-white/60">
                          {session.user.email ?? ""}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-5">
                    {navGroups.map((group) => (
                      <div key={group.label} className="space-y-1">
                        <p className="mb-2 px-3 text-[0.62rem] font-medium uppercase tracking-[0.16em] text-white/60">
                          {group.label}
                        </p>
                        {group.items.map((item) => {
                          const active = publicNavItemIsActive(pathname, item.href);
                          const ItemIcon = publicNavIcons[item.key];
                          return (
                            <Link prefetch={false}
                              key={item.href}
                              href={item.href}
                              onClick={onClose}
                              className={cn(
                                "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-[background-color,color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]",
                                active
                                  ? "bg-white/12 text-white"
                                  : "text-white/64 hover:bg-white/8 hover:text-white",
                              )}
                              aria-current={active ? "page" : undefined}
                            >
                              <span className={cn(
                                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                                active ? "bg-white/12 text-white" : "bg-white/[0.06] text-white/60",
                              )}>
                                <ItemIcon size={17} weight={active ? "fill" : "duotone"} aria-hidden="true" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{item.label}</span>
                                <span className="mt-0.5 block text-xs leading-5 text-white/65">
                                  {item.description}
                                </span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {!session?.user && (
                    <div className="mt-5 border-t border-white/8 pt-4">
                      <Link prefetch={false}
                        href="/login"
                        onClick={onClose}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-amber-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:scale-[0.98]"
                      >
                        登入
                        <ArrowRight size={16} weight="bold" aria-hidden="true" />
                      </Link>
                    </div>
                  )}

                  {/* Member group */}
                  {session?.user && (
                    <>
                      <div className="my-4 border-t border-white/8" />
                      <div className="space-y-0.5">
                        <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-widest text-white/60">
                          會員
                        </p>
                        {memberMenuItems.map((item) => {
                          const active =
                            pathname === item.href ||
                            (item.href !== "/dashboard" &&
                              pathname.startsWith(item.href)) ||
                            (item.href === "/dashboard" &&
                              pathname === "/dashboard");
                          return (
                            <Link prefetch={false}
                              key={item.href}
                              href={item.href}
                              onClick={onClose}
                              className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-[background-color,color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]",
                                active
                                  ? "bg-white/12 font-medium text-white"
                                  : "text-white/60 hover:bg-white/8 hover:text-white",
                              )}
                              aria-current={active ? "page" : undefined}
                            >
                              <item.icon
                                size={18}
                                weight={active ? "fill" : "duotone"}
                                className={active ? "text-white" : "text-white/60"}
                              />
                              {item.label}
                            </Link>
                          );
                        })}
                        {isAdmin && (
                          <Link prefetch={false}
                            href="/admin"
                            onClick={onClose}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-[background-color,color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]",
                              pathname.startsWith("/admin")
                                ? "bg-white/12 font-medium text-white"
                                : "text-white/60 hover:bg-white/8 hover:text-white",
                            )}
                            aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                          >
                            <GearSix
                              size={18}
                              weight={pathname.startsWith("/admin") ? "fill" : "duotone"}
                              className="text-white/60"
                            />
                            後台管理
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* ─── Logout ─── */}
            {session?.user && (
              <div className="border-t border-white/8 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    signOut({ callbackUrl: "/" });
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 transition-[background-color,color,transform] hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
                >
                  <SignOut size={18} weight="bold" className="text-white/60" />
                  登出
                </button>
              </div>
            )}
      </SheetContent>
    </Sheet>
  );
}
