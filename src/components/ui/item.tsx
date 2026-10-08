import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const itemVariants = cva(
  "flex w-full items-center gap-3 rounded-lg border text-left transition-colors",
  {
    variants: {
      variant: {
        default: "border-border-subtle bg-surface",
        muted: "border-transparent bg-surface-muted/60",
        outline: "border-border bg-transparent",
      },
      size: {
        sm: "p-3",
        md: "p-4",
        lg: "p-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ItemProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof itemVariants> {}

export function Item({ className, variant, size, ...props }: ItemProps) {
  return <div className={cn(itemVariants({ variant, size }), className)} {...props} />;
}

export function ItemMedia({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 items-center justify-center", className)} {...props} />;
}

export function ItemContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 flex-1", className)} {...props} />;
}

export function ItemTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-text-primary", className)} {...props} />;
}

export function ItemDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm leading-6 text-text-secondary", className)} {...props} />;
}

export function ItemActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ml-auto flex shrink-0 items-center gap-2", className)} {...props} />;
}
