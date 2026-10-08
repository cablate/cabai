import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center rounded-md font-medium transition-[background-color,color,border-color,opacity,transform] duration-normal ease-smooth focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&>[data-icon='inline-end']]:transition-transform [&>[data-icon='inline-end']]:duration-normal hover:[&>[data-icon='inline-end']]:translate-x-0.5 focus-visible:[&>[data-icon='inline-end']]:translate-x-0.5 motion-reduce:[&>[data-icon='inline-end']]:transition-none",
  {
    variants: {
      variant: {
        primary:
          "bg-surface-inverse text-text-inverted hover:bg-surface-inverse-hover",
        secondary:
          "border border-border bg-surface text-text-primary hover:border-border-strong hover:bg-surface-muted",
        danger: "bg-danger text-text-inverted hover:bg-danger-strong",
        ghost: "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
      },
      size: {
        sm: "min-h-9 gap-1.5 px-3 py-1.5 text-xs",
        md: "gap-2 px-5 py-2.5 text-sm",
        lg: "min-h-12 gap-2 px-6 py-3 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      asChild = false,
      children,
      disabled,
      type,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size }), className)}
          aria-busy={loading || undefined}
          aria-disabled={isDisabled || undefined}
          data-disabled={isDisabled || undefined}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <svg
            className="-ml-1 h-4 w-4 animate-spin motion-reduce:animate-none"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
