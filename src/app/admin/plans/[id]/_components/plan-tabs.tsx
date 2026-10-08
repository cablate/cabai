import Link from "next/link";
import { cn } from "@/lib/utils";

interface PlanTabsProps {
  planId: string;
  activeTab: "overview" | "presentation" | "delivery" | "checkout";
}

export function PlanTabs({ planId, activeTab }: PlanTabsProps) {
  const tabs: Array<{ id: PlanTabsProps["activeTab"]; label: string; href: string }> = [
    { id: "overview", label: "概覽", href: `/admin/plans/${planId}` },
    { id: "presentation", label: "展示", href: `/admin/plans/${planId}/presentation` },
    { id: "delivery", label: "交付", href: `/admin/plans/${planId}/delivery` },
    { id: "checkout", label: "結帳", href: `/admin/plans/${planId}/checkout` },
  ];

  return (
    <nav className="flex gap-1 border-b border-border-subtle pb-0">
      {tabs.map((tab) => (
        <Link prefetch={false}
          key={tab.id}
          href={tab.href}
          className={cn(
            "px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors",
            activeTab === tab.id
              ? "bg-surface text-text-primary border border-b-0 border-border-subtle -mb-px"
              : "text-text-muted hover:text-text-secondary hover:bg-surface-muted"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
