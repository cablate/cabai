"use client";

import { useSession } from "next-auth/react";

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  if (status === "loading" || !session) return null;
  return <>{children}</>;
}
