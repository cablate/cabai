import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";
import { BRAND_NAME } from "@/lib/constants";
import { TrackAction } from "@/components/track-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
  ArrowRight,
  ChatCircleDots,
  CheckCircle,
  DiscordLogo,
  SignIn,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "AI Agent 學習與實作社群",
  description: `加入 ${BRAND_NAME} Discord 社群，討論 AI Agent、Claude Code 與 Vibe Coding 實作，分享作品與學習進度。`,
  alternates: { canonical: "/community" },
  openGraph: {
    title: `${BRAND_NAME} 學習社群`,
    description: `在 ${BRAND_NAME} 連結 Discord，課後繼續討論問題、分享實作。`,
    url: "/community",
    type: "website",
  },
};

const PROFILE_ONBOARDING_PATH = "/dashboard/profile?community=1";
const communityBenefits = [
  "討論課程裡沒解完的問題",
  "分享作品、做法與實作進度",
  "查看平台更新與活動資訊",
];
const communitySteps = [
  { Icon: SignIn, title: `建立或登入 ${BRAND_NAME} 帳號`, description: "使用 Google 帳號繼續，不需要再記一組新的密碼。" },
  { Icon: DiscordLogo, title: "連結 Discord", description: `在個人資料頁完成授權；${BRAND_NAME} 不會取得你的 Discord 密碼。` },
  { Icon: UsersThree, title: "進入對應社群", description: "系統會協助加入伺服器，並同步免費會員或已購內容對應的身分組。" },
];

export default async function CommunityPage() {
  const session = await auth();
  const primaryHref = session?.user?.id
    ? PROFILE_ONBOARDING_PATH
    : `/login?callbackUrl=${encodeURIComponent(PROFILE_ONBOARDING_PATH)}`;

  return (
    <article className="min-h-[calc(100dvh-var(--site-header-height))] bg-surface-hover pb-20 pt-12 md:pt-16">
      <div className="mx-auto max-w-5xl px-5 md:px-8">
        <header className="grid gap-10 pb-12 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start xl:gap-16 xl:pb-14">
          <div className="max-w-2xl">
            <Badge variant="default" className="bg-surface-muted font-mono tracking-wide text-text-secondary">
              {BRAND_NAME} 學習社群
            </Badge>
            <h1 className="mt-5 max-w-2xl font-display text-3xl font-medium leading-[1.08] tracking-[-0.04em] text-text-primary sm:text-4xl md:text-5xl">
              加入學習社群，一起討論 AI 實作
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-text-secondary">
              這裡是 {BRAND_NAME} 的 AI 實作交流社群。連上 Discord 後，可以繼續問問題、分享做到哪裡；系統也會依照你擁有的內容同步會員身分組。
            </p>
            <ul className="mt-6 grid gap-3 text-sm text-text-secondary">
              {communityBenefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2">
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <Card surface="default" padding="lg" className="xl:mt-1">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-inverse text-text-inverted">
                <DiscordLogo size={20} weight="fill" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">Discord 整合</Badge>
                  <Badge variant={session?.user?.id ? "success" : "default"}>
                    {session?.user?.id ? "已登入" : "尚未登入"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-semibold text-text-primary">連結 Discord 社群</p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  先完成帳號連結，之後由系統協助同步你能加入的社群身分。
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <TrackAction eventType="community_cta_clicked" properties={{ destination: "discord" }}>
                <Button asChild size="lg" className="w-full">
                  <Link prefetch={false} href={primaryHref}>
                    {session?.user?.id ? <DiscordLogo size={18} weight="fill" /> : <SignIn size={18} weight="bold" />}
                    {session?.user?.id ? "前往個人資料連結 Discord" : `建立 ${BRAND_NAME} 帳號並連結 Discord`}
                    <ArrowRight size={16} weight="bold" />
                  </Link>
                </Button>
              </TrackAction>
              <TrackAction eventType="community_cta_clicked" properties={{ destination: "products" }}>
                <Button asChild variant="secondary" size="lg" className="w-full">
                  <Link prefetch={false} href="/products">先看 {BRAND_NAME} 免費試看與內容</Link>
                </Button>
              </TrackAction>
            </div>
          </Card>
        </header>

        <Separator />

        <section aria-labelledby="community-steps" className="py-12 md:py-16">
          <div className="grid gap-8 xl:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)] xl:gap-12">
            <div>
              <p className="font-mono text-xs font-medium tracking-widest text-text-secondary">加入方式</p>
              <h2 id="community-steps" className="mt-3 font-display text-2xl font-medium tracking-[-0.035em] text-text-primary md:text-3xl">
                連結 Discord，加入對應社群
              </h2>
            </div>
            <ol className="relative ms-2 border-s border-border-subtle">
              {communitySteps.map(({ Icon, title, description }, index) => (
                <li key={title} className="relative pb-8 ps-8 last:pb-0">
                  <span
                    className="absolute -start-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface-hover"
                    aria-hidden="true"
                  />
                  <Item variant="muted" size="sm" className="border-0 bg-transparent p-0 shadow-none">
                    <ItemMedia className="h-10 w-10 rounded-lg bg-surface-muted text-text-primary">
                      <Icon size={21} weight="duotone" aria-hidden="true" />
                    </ItemMedia>
                    <ItemContent>
                      <p className="text-xs font-medium text-text-secondary">0{index + 1}</p>
                      <ItemTitle className="mt-1 text-base">{title}</ItemTitle>
                      <ItemDescription className="mt-2 max-w-xl">{description}</ItemDescription>
                    </ItemContent>
                  </Item>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <aside className="border-t border-border-subtle pt-7">
          <Alert variant="default" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <ChatCircleDots size={22} weight="duotone" aria-hidden="true" />
            <div className="min-w-0">
              <AlertTitle>連結時卡住了？</AlertTitle>
              <AlertDescription>直接來信告訴我們卡在哪裡，我們會幫你查帳號和 Discord 的連結情況。</AlertDescription>
            </div>
          <Button asChild variant="secondary" size="md" className="shrink-0">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} 社群連結協助`)}`}
            >
              {CONTACT_EMAIL}
            </a>
          </Button>
          </Alert>
        </aside>
      </div>
    </article>
  );
}
