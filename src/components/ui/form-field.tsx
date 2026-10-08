"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const fieldControlClassName =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

interface FieldControlAccessibilityProps {
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

interface FormFieldProps {
  id?: string;
  label?: string;
  error?: string;
  helperText?: string;
  describedBy?: string;
  className?: string;
  children: (props: FieldControlAccessibilityProps) => ReactNode;
}

export function FormField({
  id,
  label,
  error,
  helperText,
  describedBy,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId().replace(/:/g, "");
  const fieldId = id ?? `field-${generatedId}`;
  const messageId = error
    ? `${fieldId}-error`
    : helperText
      ? `${fieldId}-helper`
      : undefined;
  const ariaDescribedBy = [describedBy, messageId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={fieldId} className="block text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      {children({
        id: fieldId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": ariaDescribedBy,
      })}
      {error && (
        <p id={`${fieldId}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={`${fieldId}-helper`} className="text-xs text-text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
}
