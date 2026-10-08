import { Badge, type BadgeProps } from "./badge";

const statusVariants = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  neutral: "default",
} as const satisfies Record<string, NonNullable<BadgeProps["variant"]>>;

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: keyof typeof statusVariants;
  children: React.ReactNode;
}

export function StatusBadge({
  status,
  children,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status]} className={className} {...props}>
      {children}
    </Badge>
  );
}
