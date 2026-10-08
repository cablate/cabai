"use client";

import { useEffect, useMemo, useRef } from "react";
import { CheckCircle, CloudArrowUp, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface FormActionFeedback {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export function FormErrorSummary({
  feedback,
  fieldLabels,
  className,
}: {
  feedback: FormActionFeedback | null | undefined;
  fieldLabels: Record<string, string>;
  className?: string;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () => Object.entries(feedback?.fieldErrors ?? {})
      .flatMap(([field, messages]) => (messages ?? []).map((message) => ({ field, message }))),
    [feedback?.fieldErrors],
  );
  const signature = `${feedback?.error ?? ""}:${entries.map((entry) => `${entry.field}:${entry.message}`).join("|")}`;

  useEffect(() => {
    if (signature !== ":") summaryRef.current?.focus();
  }, [signature]);

  if (!feedback?.error && entries.length === 0) return null;

  return (
    <div ref={summaryRef} tabIndex={-1} role="alert" className={cn("rounded-xl border border-danger/25 bg-danger-light p-4 outline-none focus-visible:ring-2 focus-visible:ring-danger", className)}>
      <div className="flex items-start gap-2">
        <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-danger">請修正下列問題</h2>
          {feedback?.error && <p className="mt-1 text-sm text-danger">{feedback.error}</p>}
          {entries.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
              {entries.map((entry, index) => (
                <li key={`${entry.field}:${entry.message}:${index}`}>
                  <a href={`#${entry.field}`} className="rounded-sm underline decoration-danger/40 underline-offset-2 transition-colors hover:decoration-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger">
                    {fieldLabels[entry.field] ?? entry.field}：{entry.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export type FormSaveState = "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";

export function FormSaveStatus({ state, className }: { state: FormSaveState; className?: string }) {
  const content = {
    idle: { label: "尚未變更", icon: null, tone: "text-text-muted" },
    dirty: { label: "有尚未儲存的變更", icon: WarningCircle, tone: "text-warning" },
    saving: { label: "正在儲存…", icon: CloudArrowUp, tone: "text-text-muted" },
    saved: { label: "所有變更已儲存", icon: CheckCircle, tone: "text-success" },
    failed: { label: "儲存失敗，可重試", icon: WarningCircle, tone: "text-danger" },
    conflict: { label: "偵測到較新的版本", icon: WarningCircle, tone: "text-danger" },
  }[state];
  const Icon = content.icon;
  return (
    <div className={cn("inline-flex items-center gap-2 text-sm", content.tone, className)} aria-live="polite">
      {Icon && <Icon size={17} weight={state === "saving" ? "regular" : "fill"} aria-hidden="true" />}
      <span>{content.label}</span>
    </div>
  );
}
