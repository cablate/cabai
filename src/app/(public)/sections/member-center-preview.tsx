import Link from "next/link";
import { FadeIn } from "@/components/ui/fade-in";
import {
  PlayCircle,
  Ticket,
  Receipt,
  Gear,
  BookOpen,
  Crown,
} from "@phosphor-icons/react/dist/ssr";

const memberFeatures = [
  {
    icon: PlayCircle,
    title: "我的內容",
    desc: "已購課程、訂閱內容與下載檔案",
  },
  {
    icon: Ticket,
    title: "活動票券",
    desc: "線上連結、線下入場憑證與活動資訊",
  },
  {
    icon: Receipt,
    title: "訂單紀錄",
    desc: "完整購買歷史與付款狀態",
  },
  {
    icon: Gear,
    title: "服務開通狀態",
    desc: "諮詢排程、進度追蹤與交付確認",
  },
  {
    icon: BookOpen,
    title: "課程進度",
    desc: "已完成章節、學習紀錄與進度追蹤",
  },
  {
    icon: Crown,
    title: "會員權益",
    desc: "訂閱方案、續費狀態與專屬內容",
  },
];

export function MemberCenterPreviewSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:px-8">
      <div className="grid grid-cols-1 gap-12 md:grid-cols-[1fr_1.5fr]">
        <FadeIn>
          <span className="font-mono text-xs text-text-muted">
            MEMBER CENTER
          </span>
          <h2 className="mt-4 text-3xl font-semibold text-text-primary md:text-4xl">
            購買後的體驗
          </h2>
          <p className="mt-4 max-w-xs text-sm leading-6 text-text-secondary">
            所有內容集中管理。登入會員中心，隨時回來取用你已購買的課程、票券、檔案與服務。
          </p>
          <Link prefetch={false}
            href="/dashboard"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white transition-[background-color,transform] hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            前往會員中心
          </Link>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberFeatures.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border-subtle bg-surface p-5"
              >
                <feature.icon
                  size={22}
                  weight="duotone"
                  className="text-amber-soft"
                />
                <h3 className="mt-3 text-sm font-semibold text-text-primary">
                  {feature.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
