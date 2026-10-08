import type { ReactNode } from "react";
import {
  BookOpen,
  BracketsCurly,
  GraduationCap,
  Info,
  Megaphone,
} from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states/empty-state";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { InformationDetailDialog } from "./information-detail-dialog";
import type { PublicInformationItem } from "@/lib/services/information-service";

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "short",
  day: "numeric",
});

type KindMeta = { label: string; variant: "default" | "info" | "success" | "warning"; icon: ReactNode };

const kindMeta: Record<string, KindMeta> = {
  "manual.announcement": { label: "公告", variant: "default", icon: <Megaphone size={20} weight="duotone" aria-hidden="true" /> },
  "library.published": { label: "Library", variant: "info", icon: <BookOpen size={20} weight="duotone" aria-hidden="true" /> },
  "library.updated": { label: "Library 更新", variant: "info", icon: <BookOpen size={20} weight="duotone" aria-hidden="true" /> },
  "skill.released": { label: "Skill", variant: "success", icon: <BracketsCurly size={20} weight="duotone" aria-hidden="true" /> },
  "skill.deprecated": { label: "Skill 異動", variant: "warning", icon: <BracketsCurly size={20} weight="duotone" aria-hidden="true" /> },
  "course.announced": { label: "課程公告", variant: "info", icon: <GraduationCap size={20} weight="duotone" aria-hidden="true" /> },
  "course.published": { label: "課程", variant: "default", icon: <GraduationCap size={20} weight="duotone" aria-hidden="true" /> },
  "api.capability-added": { label: "Agent API", variant: "success", icon: <Info size={20} weight="duotone" aria-hidden="true" /> },
};

function metaFor(kind: string): KindMeta {
  return kindMeta[kind] ?? { label: "公告", variant: "default", icon: <Megaphone size={20} weight="duotone" aria-hidden="true" /> };
}

export function InformationIndex({ items }: { items: PublicInformationItem[] }) {
  return (
    <section className="min-h-[calc(100dvh-var(--site-header-height))] bg-surface-hover">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="grid gap-6 border-b border-border-subtle pb-8 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-10">
          <div className="flex items-center justify-between gap-4 md:block">
            <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-accent shadow-card">
              <Megaphone size={21} weight="duotone" aria-hidden="true" />
            </span>
            <div className="text-right md:mt-5 md:text-left">
              <p className="font-mono text-xs font-medium tracking-[0.15em] text-accent">平台動態</p>
              <Badge variant="default" className="mt-2 font-mono">{items.length} 則</Badge>
            </div>
          </div>
          <div>
            <h1 className="font-display text-4xl font-medium tracking-[-0.045em] text-text-primary sm:text-5xl">最新消息</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary">
              查看 CabAI 的平台公告、功能更新與新內容。需要完整說明時，可以接著前往相關的 Library、Skill 或課程。
            </p>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border-strong bg-surface">
            <EmptyState
              icon={<Megaphone size={24} weight="duotone" aria-hidden="true" />}
              title="目前還沒有公開消息"
              description="新的 Library、Skill 與 Agent API 更新會在這裡集中展示。"
            />
          </div>
        ) : (
          <ol aria-label="CabAI 公告列表" className="mt-8 flex flex-col gap-4">
            {items.map((item) => {
              const meta = metaFor(item.kind);
              return (
                <li key={item.id}>
                  <Item
                    variant="outline"
                    className="grid items-start gap-4 rounded-xl bg-surface p-4 shadow-sm sm:p-5 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:gap-6"
                  >
                    <ItemMedia className="justify-start gap-3 md:flex-col md:items-start md:gap-2">
                      <time dateTime={item.publishedAt.toISOString()} className="text-sm text-text-secondary">
                        {dateFormatter.format(item.publishedAt)}
                      </time>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </ItemMedia>

                    <ItemContent>
                      <div className="flex items-start gap-2 text-text-secondary">
                        <span className="mt-0.5 shrink-0" aria-hidden="true">{meta.icon}</span>
                        <ItemTitle className="text-base leading-6">{item.title}</ItemTitle>
                      </div>
                      <ItemDescription className="mt-2 leading-7">{item.summary}</ItemDescription>
                    </ItemContent>

                    <div className="flex justify-start md:justify-end">
                      <InformationDetailDialog item={item} kindLabel={meta.label} kindVariant={meta.variant} />
                    </div>
                  </Item>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
