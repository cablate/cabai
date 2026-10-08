import Link from "next/link";
import { FadeIn } from "@/components/ui/fade-in";
import {
  GraduationCap,
  Microphone,
  Wrench,
  Gift,
} from "@phosphor-icons/react/dist/ssr";

const intents = [
  {
    icon: GraduationCap,
    title: "學一項能力",
    desc: "從 AI 工具到金流串接，挑選實戰課程，購買後在會員中心觀看。",
    href: "/products",
  },
  {
    icon: Microphone,
    title: "參加講座或活動",
    desc: "線上講座、線下工作坊與免費活動，報名後取得票券或連結。",
    href: "/products",
  },
  {
    icon: Wrench,
    title: "取得服務協助",
    desc: "一對一諮詢、技術顧問與客製服務，付款後安排時程。",
    href: "/products",
  },
  {
    icon: Gift,
    title: "查看免費內容",
    desc: "免費資源、公開試看與入門內容，不需付費即可開始。",
    href: "/products",
  },
];

export function IntentEntrySection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:px-8">
      <FadeIn>
        <span className="font-mono text-xs text-text-muted">
          EXPLORE BY INTENT
        </span>
        <h2 className="mt-4 text-3xl font-semibold text-text-primary md:text-4xl">
          你想做什麼？
        </h2>
        <p className="mt-4 max-w-lg text-base leading-7 text-text-secondary">
          不只有課程。選擇最符合你需求的方式開始。
        </p>
      </FadeIn>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {intents.map((intent, i) => (
          <FadeIn key={intent.title} delay={i * 0.1}>
            <Link prefetch={false}
              href={intent.href}
              className="group flex h-full flex-col rounded-lg border border-border-subtle bg-surface p-6 transition-[background-color,border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-ink/35 hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:-translate-y-0.5 focus-visible:border-border-strong focus-visible:shadow-card"
            >
              <intent.icon
                size={28}
                weight="duotone"
                className="text-amber-soft"
              />
              <h3 className="mt-4 text-lg font-semibold text-text-primary">
                {intent.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-text-secondary">
                {intent.desc}
              </p>
            </Link>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}
