import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-12 border-b border-border-subtle pb-8", className)}>
      {eyebrow && (
        <span className="inline-flex items-center rounded-full bg-success-light px-3 py-1 text-[10px] uppercase text-success font-medium mb-4">
          {eyebrow}
        </span>
      )}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-text-muted leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
