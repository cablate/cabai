import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";
import {
  buildPublicNavItems,
  type PublicContentAvailability,
} from "./public-navigation";

export function Footer({
  contentAvailability,
}: {
  contentAvailability: PublicContentAvailability;
}) {
  const navItems = buildPublicNavItems(contentAvailability);

  return (
    <footer className="border-t border-border-subtle bg-ink text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-16 md:flex-row md:items-start md:justify-between md:px-8">
        <div className="max-w-xs">
          <p className="text-sm font-semibold text-white">{BRAND_NAME}</p>
          <p className="mt-3 text-sm leading-6 text-white/62">
            課程、Skill、公開資源與公告集中在同一個帳號，讓你學習，也讓 AI 依權限取用。
          </p>
        </div>

        <div className="flex gap-16">
          <div>
            <p className="text-xs font-medium text-white/55">
              連結
            </p>
            <nav className="mt-4 flex flex-col gap-3">
              {navItems.map((item) => (
                <Link prefetch={false} key={item.href} href={item.href} className="rounded-sm text-sm text-white/66 transition-colors duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  {item.label}
                </Link>
              ))}
              <Link prefetch={false} href="/#about" className="rounded-sm text-sm text-white/66 transition-colors duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">關於</Link>
            </nav>
            <a href={`mailto:${CONTACT_EMAIL}`} className="mt-4 inline-flex rounded-sm text-sm text-white/66 transition-colors duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {CONTACT_EMAIL}
            </a>
          </div>
          <div>
            <p className="text-xs font-medium text-white/55">
              法律
            </p>
            <nav className="mt-4 flex flex-col gap-3">
              <Link prefetch={false} href="/privacy" className="rounded-sm text-sm text-white/66 transition-colors duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">隱私政策</Link>
              <Link prefetch={false} href="/terms" className="rounded-sm text-sm text-white/66 transition-colors duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">服務條款</Link>
            </nav>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-6 py-6 md:px-8">
        <p className="text-center text-xs text-white/55">
          &copy; {new Date().getFullYear()} {BRAND_NAME}
        </p>
      </div>
    </footer>
  );
}
