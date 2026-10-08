import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const cardVariants = cva("rounded-lg border border-border-subtle", {
  variants: {
    surface: {
      default: "bg-surface shadow-card",
      elevated: "bg-surface-elevated shadow-elevated",
      muted: "bg-surface-muted",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    },
    interactive: {
      true:
        "transition-[border-color,box-shadow,transform] duration-normal ease-smooth hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card focus-within:border-border-strong focus-within:shadow-card",
      false: "",
    },
  },
  defaultVariants: {
    surface: "default",
    padding: "none",
    interactive: false,
  },
});

type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export function Card({
  className,
  children,
  surface,
  padding,
  interactive,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(cardVariants({ surface, padding, interactive }), className)}
      {...props}
    >
      {children}
    </div>
  );
}
