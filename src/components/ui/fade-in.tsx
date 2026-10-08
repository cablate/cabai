"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FadeInProps {
  children: ReactNode;
  id?: string;
  delay?: number;
  duration?: number;
  y?: number;
  className?: string;
}

export function FadeIn({
  children,
  className,
  id,
}: FadeInProps) {
  return (
    <div id={id} className={cn(className)}>
      {children}
    </div>
  );
}
