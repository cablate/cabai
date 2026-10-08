import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userDiscordLinks } from "@/lib/db/schema";
import { getEntitledPlanIds } from "@/lib/access";
import { getSiteConfig } from "@/lib/site-config";
import { User, EnvelopeSimple, DiscordLogo, LinkBreak, CheckCircle, Info, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { RefreshRolesButton } from "@/components/refresh-discord-roles-button";

type ProfilePageProps = {
  searchParams: Promise<{
    community?: string | string[];
    discord?: string | string[];
  }>;
};

const discordMessages = {
  linked: { tone: "success", title: "Discord 已連結", message: "帳號連結完成，會員身分組已開始同步。" },
  not_configured: { tone: "warning", title: "Discord 尚未開放", message: "目前無法開始連結，請稍後再試或聯絡我們。" },
  cancelled: { tone: "info", title: "已取消連結", message: "Discord 沒有變更，你可以在準備好後再次連結。" },
  already_linked: { tone: "warning", title: "這個 Discord 已被使用", message: "此 Discord 帳號已連結其他 CabAI 帳號；若需要協助，請聯絡我們。" },
  error: { tone: "warning", title: "Discord 連結未完成", message: "連結過程發生問題，請重試；若持續失敗，請聯絡我們。" },
} as const;

type DiscordMessageKey = keyof typeof discordMessages;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { user } = session;
  const query = await searchParams;
  const communityOnboarding = firstValue(query.community) === "1";
  const discordValue = firstValue(query.discord);
  const discordMessage =
    discordValue && discordValue in discordMessages
      ? discordMessages[discordValue as DiscordMessageKey]
      : null;

  const discordLink = await db.query.userDiscordLinks.findFirst({
    where: eq(userDiscordLinks.userId, user.id!),
  });

  let discordRoleNames: string[] = [];
  if (discordLink) {
    const entitledPlanIds = await getEntitledPlanIds(user.id!);
    if (entitledPlanIds.size > 0) {
      const allMappings = await db.query.discordRoleMappings.findMany({
        columns: { planId: true, roleName: true },
      });
      discordRoleNames = allMappings
        .filter((m) => entitledPlanIds.has(m.planId))
        .map((m) => m.roleName)
        .filter((name): name is string => !!name);
    }

    const defaultRoleId = await getSiteConfig("default_discord_role_id");
    if (defaultRoleId) {
      discordRoleNames = ["免費會員", ...discordRoleNames];
    }
  }

  return (
    <>
      {communityOnboarding && (
        <section aria-labelledby="community-onboarding-title" className="mb-6 rounded-2xl border border-border-subtle bg-surface px-6 py-5 md:px-8">
          <div className="flex gap-3">
            <Info size={22} weight="duotone" className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
            <div>
              <h1 id="community-onboarding-title" className="text-base font-semibold text-text-primary">
                {discordLink ? "你已經在 CabAI 學習社群中" : "下一步：連結 Discord"}
              </h1>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {discordLink
                  ? "Discord 帳號已連結；你可以在下方確認帳號與目前同步的身分組。"
                  : "完成連結後，系統會協助加入設定的社群，並同步你目前擁有的會員身分組。"}
              </p>
            </div>
          </div>
        </section>
      )}

      {discordMessage && (
        <div
          role={discordMessage.tone === "warning" ? "alert" : "status"}
          className="mb-6 flex gap-3 rounded-xl border border-border-subtle bg-surface px-5 py-4"
        >
          {discordMessage.tone === "success" ? (
            <CheckCircle size={21} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          ) : discordMessage.tone === "warning" ? (
            <WarningCircle size={21} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <Info size={21} weight="fill" className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-semibold text-text-primary">{discordMessage.title}</p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">{discordMessage.message}</p>
          </div>
        </div>
      )}

      {/* Profile card */}
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex items-center gap-4 px-6 py-6 md:px-8">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface-muted">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name ?? "使用者頭像"}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <User size={24} className="text-text-muted" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-text-primary">
              {user.name ?? "未設定名稱"}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-text-secondary">
              <EnvelopeSimple size={14} weight="duotone" />
              <span className="truncate">{user.email ?? ""}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Discord */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:gap-4 md:px-8">
          {/* Icon + content row (mobile: stacked, desktop: inline) */}
          <div className="flex flex-1 gap-3">
            <div className="flex items-center">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${discordLink ? "bg-indigo-50" : "bg-surface-muted"}`}>
                <DiscordLogo size={22} weight="fill" className={discordLink ? "text-indigo-500" : "text-text-muted"} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold text-text-primary">Discord 帳號</p>
                {discordLink && (
                  <span className="text-sm font-medium text-indigo-600">
                    {discordLink.discordUsername || discordLink.discordId}
                  </span>
                )}
              </div>

              {discordLink && discordRoleNames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {discordRoleNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center rounded-md bg-indigo-50/80 px-2.5 py-1 text-[11px] font-medium text-indigo-600 ring-1 ring-indigo-200/60"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {discordLink && discordRoleNames.length === 0 && (
                <p className="mt-2 text-xs text-text-muted">尚無可用身分組</p>
              )}

              {!discordLink && (
                <p className="mt-3 text-xs text-text-secondary">
                  連結 Discord 即可加入社群參與討論，並自動取得對應的會員身分組
                </p>
              )}
            </div>
          </div>

          {/* Actions — mobile: full width, desktop: inline */}
          <div className="flex items-center md:shrink-0">
            {discordLink ? (
              <div className="flex w-full items-center gap-2 md:w-auto">
                <RefreshRolesButton />
                <form action="/api/discord/unlink" method="POST" className="flex">
                  <button
                    type="submit"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:scale-[0.98]"
                  >
                    <LinkBreak size={12} />
                    取消
                  </button>
                </form>
              </div>
            ) : (
              <Link prefetch={false}
                href="/api/discord/link"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-600 active:scale-[0.98] md:w-auto"
              >
                <DiscordLogo size={14} weight="fill" />
                連結 Discord
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
