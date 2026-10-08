import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "../button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-16 text-center", className)}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-muted text-text-muted">
          {icon}
        </div>
      )}
      <h2 className="text-2xl font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-2 max-w-md text-text-muted">{description}</p>}
      {action && (
        <div className="mt-6">
          <Button asChild>
            <Link prefetch={false} href={action.href}>{action.label}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
