"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { fieldControlClassName, FormField } from "./form-field";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, id, children, "aria-describedby": describedBy, ...props }, ref) => (
    <FormField id={id} label={label} error={error} helperText={helperText} describedBy={describedBy}>
      {(accessibilityProps) => (
        <select
          ref={ref}
          {...props}
          {...accessibilityProps}
          className={cn(
            fieldControlClassName,
            error && "border-danger focus:border-danger focus:ring-danger",
            className,
          )}
        >
          {children}
        </select>
      )}
    </FormField>
  ),
);
Select.displayName = "Select";
