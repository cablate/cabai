"use client";

import { PUBLIC_BRANDING } from "@/lib/config/public-branding";


import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BookOpenText,
  BracketsCurly,
  CaretDown,
  Database,
  House,
  List,
  Megaphone,
  Receipt,
  Robot,
  SignOut,
  Sparkle,
  UserCircle,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { SignedIn } from "@/components/auth/signed-in";
import { SignedOut } from "@/components/auth/signed-out";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { BRAND_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { MobileDrawer } from "./mobile-drawer";
import {
  buildPublicNavItems,
  publicNavItemIsActive,
  type PublicContentAvailability,
  type PublicNavKey,
} from "./public-navigation";

const memberMenuItems = [
  { href: "/dashboard", label: "我的內容", icon: BookOpen },
  { href: "/dashboard/orders", label: "訂單紀錄", icon: Receipt },
  { href: "/dashboard/profile", label: "個人資料", icon: UserCircle },
  { href: "/dashboard/settings/agent", label: "Agent 串接", icon: Robot },
];

const publicMenuIcons: Record<PublicNavKey, typeof Sparkle> = {
  home: House,
  products: BookOpenText,
  library: Database,
  skills: BracketsCurly,
  information: Megaphone,
  community: UsersThree,
};

export function Header({
  contentAvailability,
}: {
  contentAvailability: PublicContentAvailability;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const isLoading = status === "loading";
  const navItems = buildPublicNavItems(contentAvailability);
  const discoverItems = navItems.filter((item) => item.section === "discover");
  const informationItem = navItems.find((item) => item.key === "information");
  const communityItem = navItems.find((item) => item.key === "community");

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-2.5 pt-2 sm:px-4 sm:pt-2.5 md:px-8 md:pt-3">
        <nav
          aria-label="主要導覽"
          className="site-header-surface pointer-events-auto mx-auto grid h-11 max-w-[76rem] grid-cols-[auto_1fr_auto] items-center rounded-2xl border border-border bg-surface/90 px-3 shadow-elevated ring-1 ring-surface-elevated/70 backdrop-blur-2xl sm:px-4 lg:px-5"
        >
          <Link prefetch={false}
            href="/"
            className="group flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg text-sm font-semibold text-text-primary focus-visible:outline-offset-4"
          >
            <span className="flex size-8 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-elevated transition-transform duration-300 ease-smooth group-hover:-rotate-3 group-hover:scale-105">
              <Image
                src={PUBLIC_BRANDING.logo}
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-cover"
              />
            </span>
            <span className="truncate font-display text-base tracking-[-0.02em]">{BRAND_NAME}</span>
            <span className="hidden h-4 w-px bg-border xl:block" aria-hidden="true" />
            <span className="hidden text-[0.68rem] font-medium tracking-[0.08em] text-text-muted xl:block">
              KNOWLEDGE HUB
            </span>
          </Link>

          <div className="hidden justify-self-center xl:flex">
            <NavigationMenu delayDuration={90} skipDelayDuration={250}>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    asChild
                    active={pathname === "/"}
                    className={cn(navigationMenuTriggerStyle(), "min-h-10")}
                  >
                    <Link prefetch={false} href="/" aria-current={pathname === "/" ? "page" : undefined}>
                      首頁
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger
                    className={cn(
                      "min-h-10",
                      discoverItems.some((item) => publicNavItemIsActive(pathname, item.href)) &&
                        "bg-surface-muted text-text-primary",
                    )}
                  >
                    探索內容
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-[38rem] grid-cols-[0.9fr_1.1fr] gap-2 p-2">
                      <NavigationMenuLink asChild className="group relative min-h-52 overflow-hidden bg-ink p-5 text-text-inverted hover:bg-surface-inverse-hover hover:text-text-inverted focus-visible:bg-surface-inverse-hover focus-visible:text-text-inverted">
                        <Link prefetch={false} href="/products">
                          <span className="absolute -right-8 -top-10 size-36 rounded-full border border-border-inverted bg-surface/[0.04] transition-transform duration-500 ease-smooth group-hover:scale-110" aria-hidden="true" />
                          <span className="absolute -bottom-12 -left-10 size-32 rounded-full bg-accent/18 blur-2xl" aria-hidden="true" />
                          <span className="relative flex h-full flex-col">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-surface/[0.1] text-amber-soft">
                              <Sparkle size={20} weight="duotone" aria-hidden="true" />
                            </span>
                            <span className="mt-auto pt-8">
                              <span className="block font-display text-xl font-medium tracking-[-0.025em]">
                                查看所有課程與內容
                              </span>
                              <span className="mt-2 block text-sm leading-6 text-text-inverted/62">
                                從課程、免費內容到可直接投入工作的資源。
                              </span>
                              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-soft">
                                探索全部
                                <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
                              </span>
                            </span>
                          </span>
                        </Link>
                      </NavigationMenuLink>

                      <div className="grid content-start gap-1">
                        {discoverItems.map((item) => {
                          const Icon = publicMenuIcons[item.key];
                          const active = publicNavItemIsActive(pathname, item.href);
                          return (
                            <NavigationMenuLink key={item.href} asChild active={active}>
                              <Link prefetch={false} href={item.href} aria-current={active ? "page" : undefined}>
                                <span className="flex items-start gap-3">
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                                    <Icon size={18} weight="duotone" aria-hidden="true" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block font-semibold text-text-primary">{item.label}</span>
                                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                                      {item.description}
                                    </span>
                                  </span>
                                </span>
                              </Link>
                            </NavigationMenuLink>
                          );
                        })}
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {informationItem ? (
                  <NavigationMenuItem>
                    <NavigationMenuLink
                      asChild
                      active={publicNavItemIsActive(pathname, informationItem.href)}
                      className={cn(navigationMenuTriggerStyle(), "min-h-10")}
                    >
                      <Link prefetch={false}
                        href={informationItem.href}
                        aria-current={publicNavItemIsActive(pathname, informationItem.href) ? "page" : undefined}
                      >
                        {informationItem.label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ) : null}

                {communityItem ? (
                  <NavigationMenuItem>
                    <NavigationMenuLink
                      asChild
                      active={publicNavItemIsActive(pathname, communityItem.href)}
                      className={cn(navigationMenuTriggerStyle(), "min-h-10")}
                    >
                      <Link prefetch={false}
                        href={communityItem.href}
                        aria-current={publicNavItemIsActive(pathname, communityItem.href) ? "page" : undefined}
                      >
                        {communityItem.label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ) : null}
                <NavigationMenuIndicator />
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="hidden items-center justify-end gap-1.5 xl:flex">
            {isLoading ? (
              <div role="status" className="flex h-10 w-[6.5rem] items-center gap-2 rounded-lg bg-surface-muted px-3">
                <span className="size-4 animate-pulse rounded-full bg-border-strong motion-reduce:animate-none" />
                <span className="h-2.5 flex-1 animate-pulse rounded-full bg-border motion-reduce:animate-none" />
                <span className="sr-only">載入會員狀態</span>
              </div>
            ) : (
              <>
                <SignedOut>
                  <Button asChild size="sm" className="min-h-10 min-w-[5.75rem] rounded-lg">
                    <Link prefetch={false} href="/login">
                      登入
                      <ArrowRight size={14} weight="bold" aria-hidden="true" />
                    </Link>
                  </Button>
                </SignedOut>

                <SignedIn>
                  {isAdmin ? (
                    <Button asChild size="sm" variant="ghost" className="min-h-10 rounded-lg">
                      <Link prefetch={false} href="/admin" aria-current={pathname.startsWith("/admin") ? "page" : undefined}>
                        後台
                      </Link>
                    </Button>
                  ) : null}
                  <MemberDropdown pathname={pathname} />
                </SignedIn>
              </>
            )}
          </div>

          <button
            ref={mobileMenuTriggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="col-start-3 flex size-11 items-center justify-center justify-self-end rounded-lg text-text-primary transition-[background-color,transform] hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] xl:hidden"
            aria-label={menuOpen ? "關閉選單" : "開啟選單"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
          </button>
        </nav>
      </header>

      <MobileDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        triggerRef={mobileMenuTriggerRef}
        contentAvailability={contentAvailability}
      />
    </>
  );
}

function MemberDropdown({ pathname }: { pathname: string }) {
  const isInMemberArea =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/my");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group inline-flex min-h-10 items-center gap-2 rounded-lg bg-surface-inverse px-3.5 py-2 text-xs font-medium text-text-inverted outline-none transition-[background-color,transform] duration-200 hover:bg-surface-inverse-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:scale-[0.98]",
          isInMemberArea && "ring-1 ring-accent/35",
        )}
      >
        <UserCircle size={16} weight="duotone" aria-hidden="true" />
        會員中心
        <CaretDown
          size={13}
          weight="bold"
          className="transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-60 p-2">
        <div className="px-3 pb-2 pt-1">
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-text-inverted/38">
            YOUR CABAI
          </p>
        </div>
        {memberMenuItems.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="rounded-lg px-3 py-2.5">
            <Link prefetch={false}
              href={item.href}
              className={`rounded-md transition-[background-color,color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-inverted active:scale-[0.99] ${pathname === item.href ? "bg-surface/[0.1] text-text-inverted" : ""}`}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <item.icon size={18} weight="duotone" aria-hidden="true" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="my-1 h-px bg-border-inverted" />
        <DropdownMenuItem
          onSelect={() => signOut({ callbackUrl: "/" })}
          className="rounded-lg px-3 py-2.5 text-text-inverted/50"
        >
          <SignOut size={18} weight="bold" aria-hidden="true" />
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
