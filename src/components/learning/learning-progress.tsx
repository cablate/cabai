import { cn } from "@/lib/utils";

export function LearningProgress({ completed, total, className, compact = false }: {
  completed: number;
  total: number;
  className?: string;
  compact?: boolean;
}) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-4 text-xs text-text-muted">
        <span>{completed}/{total} 已完成</span>
        <span className="font-mono tabular-nums">{percent}%</span>
      </div>
      <div role="progressbar" aria-label="課程完成進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className={cn("mt-2 w-full overflow-hidden rounded-full bg-surface-muted", compact ? "h-1" : "h-2")}>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
