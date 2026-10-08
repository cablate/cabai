"use client";

import {
  CheckCircle,
  ShieldCheck,
  Smiley,
} from "@phosphor-icons/react";
import type { TrustBlock } from "@/lib/validations/plan-presentations";

interface TrustBlockProps {
  trustNotes?: TrustBlock[] | null;
  title?: string;
}

/**
 * Reusable trust block component for detail pages
 * Shows: security, delivery assurance, refund policy
 * Can accept custom trust notes from presentation.trustNotesJson
 */
export function TrustBlock({ trustNotes, title = "購買保障" }: TrustBlockProps) {
  // Default trust messages if no custom notes provided
  const defaultTrustItems = [
    {
      icon: ShieldCheck,
      title: "由 Portaly 完成付款",
      description: "付款資料在 Portaly 付款頁輸入，CabAI 不直接保存信用卡資料",
    },
    {
      icon: CheckCircle,
      title: "會員中心統一查看",
      description: "付款確認後，可到會員中心查看目前已開放的內容與交付狀態",
    },
    {
      icon: Smiley,
      title: "需要協助時可聯繫",
      description: "取消或退費會依商品類型、使用狀態與服務條款個別處理",
    },
  ];

  // If custom trust notes are provided, render those instead
  if (trustNotes && trustNotes.length > 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6 md:p-8">
        <h2 className="mb-6 text-lg font-semibold text-text-primary">{title}</h2>
        <div className="space-y-4">
          {trustNotes.map((note, index) => (
            <div key={index} className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/10">
                  <span className="text-sm font-semibold text-ink">✓</span>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-text-primary">{note.title}</h3>
                <p className="mt-1 text-sm text-text-secondary">{note.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default trust block
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-6 md:p-8">
      <h2 className="mb-6 text-lg font-semibold text-text-primary">{title}</h2>
      <div className="grid gap-6 md:grid-cols-3">
        {defaultTrustItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <Icon size={20} className="text-emerald-600" weight="duotone" />
              </div>
              <div>
                <h3 className="font-medium text-text-primary">{item.title}</h3>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
