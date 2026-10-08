"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { fieldControlClassName, FormField } from "./form-field";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, "aria-describedby": describedBy, ...props }, ref) => (
    <FormField id={id} label={label} error={error} helperText={helperText} describedBy={describedBy}>
      {(accessibilityProps) => (
        <input
          ref={ref}
          {...props}
          {...accessibilityProps}
          className={cn(
            fieldControlClassName,
            error && "border-danger focus:border-danger focus:ring-danger",
            className,
          )}
        />
      )}
    </FormField>
  ),
);
Input.displayName = "Input";
