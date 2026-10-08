"use client";

import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface CheckboxFieldProps extends Omit<ComponentProps<"input">, "type"> {
  label: string;
  containerClassName?: string;
}

export function CheckboxField({
  id,
  label,
  className,
  containerClassName,
  ...props
}: CheckboxFieldProps) {
  const generatedId = useId().replace(/:/g, "");
  const fieldId = id ?? `checkbox-${generatedId}`;

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-within:text-text-primary",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        containerClassName,
      )}
    >
      <input
        id={fieldId}
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border-border-strong accent-accent transition-colors hover:border-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className,
        )}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
