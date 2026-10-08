"use client";

import { useState, useCallback, createContext, useContext, useRef } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return ctx.confirm;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: "",
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const settlePending = useCallback((value: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    settlePending(false);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, [settlePending]);

  function handleConfirm() {
    settlePending(true);
    setOpen(false);
  }

  function handleCancel() {
    settlePending(false);
    setOpen(false);
  }

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) settlePending(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="ui-dialog-overlay fixed inset-0 z-50 bg-overlay" />
          <AlertDialog.Content
            className="ui-dialog-content fixed left-1/2 top-1/2 z-50 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-elevated"
          >
            <AlertDialog.Title className="text-lg font-semibold text-text-primary">
              {options.title}
            </AlertDialog.Title>
            {options.description && (
              <AlertDialog.Description className="mt-2 text-sm text-text-secondary">
                {options.description}
              </AlertDialog.Description>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  {options.cancelLabel ?? "取消"}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant={options.variant ?? "danger"}
                  size="sm"
                  onClick={handleConfirm}
                >
                  {options.confirmLabel ?? "確認"}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmDialogContext.Provider>
  );
}
