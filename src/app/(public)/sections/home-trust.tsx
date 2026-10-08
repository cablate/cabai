import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  IdentificationCard,
  Robot,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { HomeSectionBackdrop } from "./home-section-backdrop";

const principles = [
  {
    icon: BookOpenText,
    title: "發布一次",
    description: "網站與 Agent API 讀取同一份已發布內容，不需要同步兩套資料。",
  },
  {
    icon: IdentificationCard,
    title: "權限只認帳號",
    description: "課程與已取得內容集中在 CabAI 帳號，不會因為更換 API Key 就消失。",
  },
  {
    icon: Robot,
    title: "回答可以追溯",
    description: "AI 取得內容類型、用途與原始位置，需要確認時可以回到來源。",
  },
] as const;

export function HomeTrustSection() {
  return (
    <section
      id="about"
      className="home-section-deferred relative isolate overflow-hidden border-b border-border-subtle bg-surface"
    >
      <HomeSectionBackdrop
        src={PUBLIC_BRANDING.illustration}
        placement="right"
        imageClassName="object-[78%_center]"
        className="opacity-[0.14] sm:opacity-[0.2]"
        overlayClassName="bg-[linear-gradient(90deg,rgba(251,252,251,0.99)_0%,rgba(251,252,251,0.96)_54%,rgba(251,252,251,0.62)_100%)]"
      />

      <div className="mx-auto grid max-w-[90rem] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] lg:gap-20 lg:py-28 xl:px-12 xl:py-32">
        <div data-home-reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="max-w-3xl font-display text-4xl font-medium leading-[1.03] tracking-[-0.05em] text-text-primary sm:text-5xl md:text-6xl">
            內容只更新一次，你和 AI 都能使用
          </h2>
          <p className="mt-7 max-w-xl text-base leading-8 text-text-secondary sm:text-lg">
            CabAI 不另外維護一套 AI 專用知識庫。內容更新、會員權限與 Agent API 都回到同一個帳號與來源。
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Button asChild variant="secondary">
              <Link prefetch={false} href="/library">瀏覽公開資源</Link>
            </Button>
            <Button asChild>
              <Link prefetch={false} href="/dashboard/settings/agent">
                連接你的 AI
                <ArrowRight data-icon="inline-end" weight="bold" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div data-home-reveal className="min-w-0">
          <div className="border-y border-border-strong/70 py-7 sm:py-8">
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(12rem,0.8fr)] sm:items-center">
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
                  <BookOpenText size={24} weight="duotone" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-display text-lg font-medium text-text-primary">CabAI 已發布內容</p>
                  <p className="mt-1 text-sm text-text-muted">唯一的內容來源</p>
                </div>
              </div>

              <div className="hidden items-center sm:flex" aria-hidden="true">
                <span data-home-flow className="h-px w-full origin-left bg-accent" />
                <ArrowRight className="-ml-1 shrink-0 text-accent" size={18} weight="bold" />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
                <div className="flex items-center gap-3 text-sm font-medium text-text-primary">
                  <UserCircle className="text-accent" size={20} weight="duotone" aria-hidden="true" />
                  網站閱讀
                </div>
                <div className="flex items-center gap-3 text-sm font-medium text-text-primary">
                  <Robot className="text-accent" size={20} weight="duotone" aria-hidden="true" />
                  Agent API 取用
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            {principles.map((principle) => (
              <article
                key={principle.title}
                className="grid gap-4 border-b border-border py-7 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6 sm:py-8"
              >
                <principle.icon className="text-accent" size={24} weight="duotone" aria-hidden="true" />
                <div>
                  <h3 className="font-display text-xl font-medium tracking-[-0.025em] text-text-primary">
                    {principle.title}
                  </h3>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-text-secondary sm:text-base">
                    {principle.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
