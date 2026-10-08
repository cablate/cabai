import Link from "next/link";
import { ArrowRight, BookOpenText, Robot } from "@phosphor-icons/react/dist/ssr";

const startingPoints = [
  {
    title: "瀏覽免費資源",
    href: "/library",
    icon: BookOpenText,
  },
  {
    title: "查看免費 Skill",
    href: "/skills",
    icon: Robot,
  },
] as const;

export function ProductStartGuide() {
  return (
    <aside
      aria-label="免費內容入口"
      className="mb-5 flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3.5 shadow-card sm:mb-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">想先從免費內容開始？</p>
        <p className="mt-0.5 text-xs leading-5 text-text-secondary">
          資源文章與 Skill 另外集中整理，不必在商品中逐項尋找。
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        {startingPoints.map((item) => {
          const Icon = item.icon;
          return (
            <Link prefetch={false}
              key={item.href}
              href={item.href}
              className="group inline-flex min-h-10 items-center gap-2 rounded-lg border border-border-subtle bg-surface-hover px-3 text-xs font-medium text-text-primary transition-[background-color,border-color,transform] hover:border-border-strong hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
            >
              <Icon size={16} weight="duotone" className="text-accent" aria-hidden="true" />
              {item.title}
              <ArrowRight
                size={14}
                weight="bold"
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
