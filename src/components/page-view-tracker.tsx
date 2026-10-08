"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { track } from "@/lib/track";
import { captureAttribution } from "@/lib/attribution";

/**
 * PageViewTracker — Fires a "page_view" event on route changes.
 *
 * Place this in layouts to automatically track page views for authenticated users.
 * Deduplicates: won't fire for the same path within 5 seconds.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    const path = pathname;

    captureAttribution(new URLSearchParams(searchParams?.toString()), window.sessionStorage);

    if (status !== "authenticated") return;

    // Avoid double-firing for the same path (Next.js strict mode, etc.)
    if (path === lastPathRef.current) return;
    lastPathRef.current = path;

    const timer = setTimeout(() => {
      track("page_view", { path });
      if (path === "/community") track("community_viewed");
    }, 500); // Small delay to ensure session is ready

    return () => clearTimeout(timer);
  }, [pathname, searchParams, status]);

  return null;
}
