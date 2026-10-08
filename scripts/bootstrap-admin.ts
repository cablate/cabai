#!/usr/bin/env node

/**
 * Bootstrap Admin Script
 *
 * Promotes a user to admin role by email.
 * Use after DB rebuild or fresh deployment when no admin exists.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts <email>
 *
 * Example:
 *   npx tsx scripts/bootstrap-admin.ts admin@example.com
 */

import { db } from "../src/lib/db";
import { users } from "../src/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { parseBootstrapAdminArgs } from "../src/lib/bootstrap-admin";

async function main() {
  const { email, allowAdditionalAdmin } = parseBootstrapAdminArgs(process.argv.slice(2));
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error("The user must log in at least once before being promoted.");
    process.exit(1);
  }

  if (user.role === "admin") {
    console.log(`User ${user.email} is already an admin.`);
    process.exit(0);
  }

  const [adminCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "admin"));
  if ((adminCount?.count ?? 0) > 0 && !allowAdditionalAdmin) {
    throw new Error("An admin already exists. Use --allow-additional-admin only for an intentional additional admin.");
  }

  await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.id, user.id));

  console.log(`✓ Promoted ${user.email} (${user.name ?? "no name"}) to admin.`);
  console.log(`  User ID: ${user.id}`);
}

main().catch((err) => {
  console.error("Failed to bootstrap admin:", err);
  process.exit(1);
});
