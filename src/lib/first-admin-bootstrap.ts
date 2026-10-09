import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { emailLooksValid } from "@/lib/email-normalize";

export const FIRST_ADMIN_BOOTSTRAP_PROVIDER = "bootstrap" as const;
export const FIRST_ADMIN_BOOTSTRAP_MIN_TOKEN_LENGTH = 32;

export type FirstAdminBootstrapErrorCode =
  | "disabled"
  | "invalid_token"
  | "already_completed"
  | "invalid_email";

export class FirstAdminBootstrapError extends Error {
  constructor(public readonly code: FirstAdminBootstrapErrorCode) {
    super(`First-admin bootstrap rejected: ${code}`);
    this.name = "FirstAdminBootstrapError";
  }
}

export function getFirstAdminBootstrapToken(
  environment: Record<string, string | undefined> = process.env,
): string | null {
  const token = environment.ADMIN_BOOTSTRAP_TOKEN?.trim() ?? "";
  return token.length >= FIRST_ADMIN_BOOTSTRAP_MIN_TOKEN_LENGTH ? token : null;
}

export function isFirstAdminBootstrapConfigured(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return getFirstAdminBootstrapToken(environment) !== null;
}

export type FirstAdminBootstrapStatus = "ready" | "disabled" | "completed";

export async function getFirstAdminBootstrapStatus(
  environment: Record<string, string | undefined> = process.env,
): Promise<FirstAdminBootstrapStatus> {
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  // This is presentation state, not the authorization check. The transaction
  // below must still reject races and direct requests while an admin exists.
  if (existingAdmin) return "completed";
  return isFirstAdminBootstrapConfigured(environment) ? "ready" : "disabled";
}

export function bootstrapTokenMatches(
  submittedToken: string,
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const expectedToken = getFirstAdminBootstrapToken(environment);
  if (!expectedToken) return false;

  const submitted = Buffer.from(submittedToken.trim(), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  if (submitted.length !== expected.length) return false;
  return timingSafeEqual(submitted, expected);
}

function normalizeBootstrapEmail(value: string): string {
  return value.trim().toLowerCase();
}

export interface BootstrappedAdmin {
  id: string;
  email: string;
  name: string | null;
}

export async function bootstrapFirstAdmin(input: {
  email: string;
  token: string;
}): Promise<BootstrappedAdmin> {
  if (!getFirstAdminBootstrapToken()) {
    throw new FirstAdminBootstrapError("disabled");
  }
  if (!bootstrapTokenMatches(input.token)) {
    throw new FirstAdminBootstrapError("invalid_token");
  }

  const email = normalizeBootstrapEmail(input.email);
  if (!emailLooksValid(email)) {
    throw new FirstAdminBootstrapError("invalid_email");
  }

  return db.transaction(async (tx) => {
    // Serialize the only operation that is allowed to create the first admin.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('cabai:first-admin-bootstrap'::text, 0))`);

    const [existingAdmin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    if (existingAdmin) {
      throw new FirstAdminBootstrapError("already_completed");
    }

    const [existingUser] = await tx
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      const [promoted] = await tx
        .update(users)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(users.id, existingUser.id))
        .returning({ id: users.id, email: users.email, name: users.name });
      if (!promoted?.email) throw new Error("Failed to promote first admin");
      return { id: promoted.id, email: promoted.email, name: promoted.name };
    }

    const [created] = await tx
      .insert(users)
      .values({ email, role: "admin" })
      .returning({ id: users.id, email: users.email, name: users.name });
    if (!created?.email) throw new Error("Failed to create first admin");
    return { id: created.id, email: created.email, name: created.name };
  });
}
