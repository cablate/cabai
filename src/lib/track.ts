/**
 * track.ts — Client-side event tracking utility.
 *
 * Fires a POST /api/track request to record user events.
 * Silent failure: never throws or shows errors to the user.
 */

import { readAttribution } from "@/lib/attribution";
import type { ClientTrackEvent } from "@/lib/track-event-contract";

export async function track(event: ClientTrackEvent, properties?: Record<string, unknown>) {
  try {
    const attribution =
      typeof window === "undefined" ? {} : readAttribution(window.sessionStorage);
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties: { ...properties, ...attribution } }),
      keepalive: true,
    });
  } catch {
    // Silent fail — tracking should never interrupt the user experience
  }
}
