"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetOverlay({ className, ...props }: ComponentProps<typeof Dialog.Overlay>) {
  return (
    <Dialog.Overlay
      className={cn(
        "ui-sheet-overlay fixed inset-0 z-30 bg-overlay",
        className,
      )}
      {...props}
    />
  );
}

interface SheetContentProps extends ComponentProps<typeof Dialog.Content> {
  side?: "left" | "right";
}

export function SheetContent({ className, side = "right", ...props }: SheetContentProps) {
  return (
    <Dialog.Portal>
      <SheetOverlay />
      <Dialog.Content
        className={cn(
          "ui-sheet-content fixed inset-y-0 z-40 flex w-[min(20rem,86dvw)] flex-col bg-ink shadow-elevated outline-none",
          side === "right" ? "right-0" : "left-0",
          className,
        )}
        {...props}
        aria-describedby={props["aria-describedby"] ?? undefined}
        data-side={side}
      />
    </Dialog.Portal>
  );
}

export const SheetTitle = Dialog.Title;
export const SheetDescription = Dialog.Description;
