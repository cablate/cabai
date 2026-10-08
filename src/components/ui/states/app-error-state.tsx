"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowClockwise, House, WarningCircle } from "@phosphor-icons/react";
import { BRAND_NAME } from "@/lib/constants";
import { captureOperationalException } from "@/lib/observability/capture";
import { cn } from "@/lib/utils";
import { Button } from "../button";

export interface AppErrorStateProps {
  contextLabel: string;
  title: string;
  description: string;
  reset: () => void;
  destinationHref: string;
  destinationLabel: string;
  errorId?: string;
  error?: unknown;
  surface?: string;
  className?: string;
}

/**
 * Shared recovery UI for Next.js render error boundaries.
 *
 * The safe-destination action intentionally uses a native anchor so recovery
 * does not depend on client-side router state that may have caused the error.
 */
export function AppErrorState({
  contextLabel,
  title,
  description,
  reset,
  destinationHref,
  destinationLabel,
  errorId,
  error,
  surface = "render",
  className,
}: AppErrorStateProps) {
  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descriptionId = `${reactId}-description`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
    if (error) {
      captureOperationalException(error, {
        errorCode: "RENDER_ERROR",
        requestId: errorId,
        surface,
      });
    }
  }, [error, errorId, surface]);

  function handleRetry() {
    if (isRetrying) return;
    setIsRetrying(true);
    reset();
    retryTimeoutRef.current = window.setTimeout(() => setIsRetrying(false), 700);
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "grid w-full place-items-center bg-surface-hover px-4 py-10 sm:px-6 sm:py-14",
        className,
      )}
    >
      <div className="w-full min-w-0 max-w-xl rounded-2xl border border-border-subtle bg-surface px-5 py-7 shadow-card sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-text-muted">
          <span className="rounded-full bg-surface-inverse px-3 py-1.5 text-text-inverted">
            {BRAND_NAME}
          </span>
          <span>{contextLabel}</span>
        </div>

        <div
          className="mt-7 flex h-12 w-12 items-center justify-center rounded-xl bg-danger-light text-danger"
          aria-hidden="true"
        >
          <WarningCircle size={26} weight="duotone" />
        </div>

        <h1
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="mt-5 text-balance text-2xl font-semibold leading-tight text-text-primary focus-visible:rounded-sm sm:text-3xl"
        >
          {title}
        </h1>
        <p
          id={descriptionId}
          className="mt-3 max-w-lg text-pretty text-sm leading-6 text-text-secondary sm:text-base sm:leading-7"
        >
          {description}
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            className="min-h-11 w-full sm:w-auto"
            onClick={handleRetry}
            disabled={isRetrying}
            aria-busy={isRetrying}
          >
            <ArrowClockwise
              size={18}
              weight="bold"
              className={isRetrying ? "motion-safe:animate-spin" : undefined}
              aria-hidden="true"
            />
            再試一次
          </Button>
          <Button className="min-h-11 w-full sm:w-auto" variant="secondary" asChild>
            <a href={destinationHref}>
              <House size={18} weight="duotone" aria-hidden="true" />
              {destinationLabel}
            </a>
          </Button>
        </div>

        {errorId ? (
          <div className="mt-7 min-w-0 border-t border-border-subtle pt-4 text-xs leading-5 text-text-muted">
            <span>錯誤識別碼：</span>
            <code className="[overflow-wrap:anywhere] font-mono text-text-secondary">
              {errorId}
            </code>
          </div>
        ) : null}
      </div>
    </section>
  );
}
