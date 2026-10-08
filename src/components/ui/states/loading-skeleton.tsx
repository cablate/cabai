import { cn } from "@/lib/utils";

export interface LoadingSkeletonProps {
  variant: "card" | "table" | "detail" | "banner";
  className?: string;
}

export function LoadingSkeleton({ variant, className }: LoadingSkeletonProps) {
  switch (variant) {
    case "card":
      return (
        <div className={cn("space-y-3", className)}>
          <div className="h-32 rounded-lg bg-surface-muted animate-pulse motion-reduce:animate-none" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 rounded bg-surface-muted animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-full rounded bg-surface-muted animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-5/6 rounded bg-surface-muted animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      );

    case "table":
      return (
        <div className={cn("space-y-3", className)}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-10 rounded bg-surface-muted animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      );

    case "detail":
      return (
        <div className={cn("space-y-6", className)}>
          <div className="h-96 rounded-lg bg-surface-muted animate-pulse motion-reduce:animate-none" />
          <div className="space-y-4 px-4">
            <div className="h-8 w-2/3 rounded bg-surface-muted animate-pulse motion-reduce:animate-none" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 rounded bg-surface-muted animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          </div>
          <div className="sticky bottom-0 h-20 rounded-lg bg-surface-muted animate-pulse motion-reduce:animate-none" />
        </div>
      );

    case "banner":
      return (
        <div className={cn("h-64 w-full rounded-lg bg-surface-muted animate-pulse motion-reduce:animate-none", className)} />
      );

    default:
      return <div className="h-64 rounded-lg bg-surface-muted animate-pulse motion-reduce:animate-none" />;
  }
}
