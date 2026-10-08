"use client";

import type { ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "../button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  retry?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = "發生錯誤",
  description = "嘗試重新載入頁面",
  retry,
  icon,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-16 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-danger-light text-danger">
        {icon || <WarningCircle size={24} weight="duotone" />}
      </div>
      <h2 className="text-2xl font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-2 max-w-md text-text-muted">{description}</p>}
      {retry && (
        <div className="mt-6">
          <Button onClick={retry}>重試</Button>
        </div>
      )}
    </div>
  );
}
