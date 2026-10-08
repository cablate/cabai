"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Verify the current user is authenticated with admin role.
 * Always queries DB for the authoritative role — never trusts JWT alone.
 * Throws on failure.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, role: true, email: true, name: true },
  });

  if (!dbUser || dbUser.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return { ...session, user: { ...session.user, role: dbUser.role } };
}
