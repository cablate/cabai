"use client";

import { useCallback, type ReactNode } from "react";

/**
 * Wraps a resource link/button to track opens and downloads.
 * Fires a POST to /api/track when clicked.
 */
export function TrackResource({
  eventType,
  resourceId,
  resourceType,
  resourceTitle,
  children,
}: {
  eventType: "resource_opened" | "resource_downloaded";
  resourceId: string;
  resourceType: string;
  resourceTitle: string;
  children: ReactNode;
}) {
  const handleClick = useCallback(() => {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventType,
        properties: { resourceId, resourceType, resourceTitle },
      }),
      keepalive: true,
    }).catch(() => {});
  }, [eventType, resourceId, resourceType, resourceTitle]);

  return (
    <span onClick={handleClick} style={{ display: "inline" }}>
      {children}
    </span>
  );
}
