"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarBlank } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InformationMarkdown } from "./information-markdown";
import type { PublicInformationItem } from "@/lib/services/information-service";

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function InformationDetailDialog({
  item,
  kindLabel,
  kindVariant,
}: {
  item: PublicInformationItem;
  kindLabel: string;
  kindVariant: "default" | "info" | "success" | "warning";
}) {
  const body = item.bodyMarkdown.trim() || item.whyItMatters.trim();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`閱讀全文：${item.title}`}>
          閱讀全文
        </Button>
      </DialogTrigger>
      <DialogContent className="ui-dialog-side inset-y-0 left-auto right-0 top-0 h-dvh w-full max-w-2xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-y-0 border-r-0 p-0 sm:rounded-l-2xl">
        <div className="flex min-h-full flex-col">
          <DialogHeader className="border-b border-border-subtle px-5 pb-5 pt-6 pr-16 sm:px-8 sm:pb-6 sm:pt-8 sm:pr-20">
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <CalendarBlank size={16} weight="duotone" aria-hidden="true" />
              <time dateTime={item.publishedAt.toISOString()}>{dateFormatter.format(item.publishedAt)}</time>
              <Badge variant={kindVariant}>{kindLabel}</Badge>
            </div>
            <DialogTitle className="text-2xl leading-tight sm:text-3xl">{item.title}</DialogTitle>
            <DialogDescription>{item.summary}</DialogDescription>
            {item.tags.length > 0 ? (
              <ul aria-label={`${item.title} 標籤`} className="flex flex-wrap gap-2 pt-1">
                {item.tags.map((tag) => <li key={tag}><Badge>{tag}</Badge></li>)}
              </ul>
            ) : null}
          </DialogHeader>

          <div className="flex-1 px-5 py-7 sm:px-8 sm:py-9">
            {body ? <InformationMarkdown content={body} /> : <p className="text-sm leading-7 text-text-secondary">目前沒有更多內文。</p>}
          </div>

          <DialogFooter className="border-t border-border-subtle px-5 py-4 sm:px-8">
            {item.href ? (
              <Button asChild variant="secondary" size="sm">
                <Link prefetch={false} href={item.href}>
                  前往相關內容
                  <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            <DialogClose asChild>
              <Button variant="ghost" size="sm">關閉</Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
