"use client";

import { useCallback, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { track } from "@/lib/track";
import type { ClientTrackEvent } from "@/lib/track-event-contract";

/**
 * Client component that fires a tracking event on click.
 * Wraps any interactive element without changing its appearance.
 */
export function TrackAction({
  eventType,
  properties,
  children,
}: {
  eventType: ClientTrackEvent;
  properties?: Record<string, unknown>;
  children: ReactNode;
}) {
  const { status } = useSession();
  const handleClick = useCallback(() => {
    if (status !== "authenticated") return;
    void track(eventType, properties);
  }, [eventType, properties, status]);

  return (
    <span onClick={handleClick} style={{ display: "inline" }}>
      {children}
    </span>
  );
}
