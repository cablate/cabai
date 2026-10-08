"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { fieldControlClassName, FormField } from "./form-field";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, "aria-describedby": describedBy, ...props }, ref) => (
    <FormField id={id} label={label} error={error} helperText={helperText} describedBy={describedBy}>
      {(accessibilityProps) => (
        <textarea
          ref={ref}
          {...props}
          {...accessibilityProps}
          className={cn(
            fieldControlClassName,
            "resize-y",
            error && "border-danger focus:border-danger focus:ring-danger",
            className,
          )}
        />
      )}
    </FormField>
  ),
);
Textarea.displayName = "Textarea";
