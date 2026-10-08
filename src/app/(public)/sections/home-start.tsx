import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Database,
  Robot,
} from "@phosphor-icons/react/dist/ssr";

const paths = [
  {
    icon: BookOpenText,
    title: "學習內容",
    description: "用課程把方法完整學起來",
    href: "/products",
  },
  {
    icon: Database,
    title: "公開資源",
    description: "查找指南、案例與排查紀錄",
    href: "/library",
  },
  {
    icon: Robot,
    title: "交給 AI 使用",
    description: "設定 Agent API，依權限取得內容",
    href: "/dashboard/settings/agent",
  },
] as const;

export function HomeStartSection() {
  return (
    <section id="start" className="border-b border-border-subtle bg-surface">
      <h2 className="sr-only">選擇下一步</h2>
      <nav
        aria-label="CabAI 內容入口"
        className="mx-auto grid max-w-[90rem] px-5 sm:px-8 md:grid-cols-[1.06fr_0.94fr_1fr] xl:px-12"
      >
        {paths.map((path) => {
          const Icon = path.icon;
          return (
            <Link prefetch={false}
              key={path.href}
              href={path.href}
              className="group -mx-5 flex min-w-0 items-center gap-4 border-b border-border-subtle px-5 py-5 transition-[background-color,color] last:border-b-0 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:bg-surface-muted sm:-mx-8 sm:px-8 md:mx-0 md:border-b-0 md:border-r md:px-6 md:last:border-r-0 lg:px-8"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent transition-[background-color,color,transform] group-hover:-translate-y-0.5 group-hover:bg-accent group-hover:text-text-inverted group-focus-visible:bg-accent group-focus-visible:text-text-inverted group-active:translate-y-0 group-active:scale-[0.98]">
                <Icon size={20} weight="duotone" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-text-primary">{path.title}</span>
                <span className="mt-1 block text-sm leading-6 text-text-secondary">
                  {path.description}
                </span>
              </span>
              <ArrowRight
                size={18}
                weight="bold"
                className="shrink-0 text-text-muted transition-[color,transform] group-hover:translate-x-1 group-hover:text-accent group-focus-visible:translate-x-1 group-focus-visible:text-accent"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
