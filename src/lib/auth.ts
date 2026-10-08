import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { authConfig } from "./auth.config";
import {
  bootstrapFirstAdmin,
  FIRST_ADMIN_BOOTSTRAP_PROVIDER,
  getFirstAdminBootstrapToken,
  FirstAdminBootstrapError,
} from "./first-admin-bootstrap";
import { createLogger } from "./logger";

const logger = createLogger("auth");

const DB_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getBootstrapProvider() {
  if (!getFirstAdminBootstrapToken()) return [];

  return [
    Credentials({
      id: FIRST_ADMIN_BOOTSTRAP_PROVIDER,
      name: "First admin bootstrap",
      credentials: {
        email: { label: "Email", type: "email" },
        token: { label: "Bootstrap token", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const token = typeof credentials?.token === "string" ? credentials.token : "";

        try {
          const admin = await bootstrapFirstAdmin({ email, token });
          return {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: "admin",
          };
        } catch (error) {
          if (error instanceof FirstAdminBootstrapError) {
            logger.warn("First-admin bootstrap rejected", { reason: error.code });
            return null;
          }
          logger.error("First-admin bootstrap failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    }),
  ];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [...(authConfig.providers ?? []), ...getBootstrapProvider()],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // Initial login — populate from user object
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "member";
        token.dbSyncedAt = Date.now();
        return token;
      }

      // Periodic DB sync — refresh role/email/name, verify existence
      const syncedAt = (token.dbSyncedAt as number) ?? 0;
      if (Date.now() - syncedAt > DB_SYNC_INTERVAL_MS) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, token.id as string),
          columns: { id: true, role: true, email: true, name: true },
        });

        if (!dbUser) {
          // User no longer exists in DB — invalidate session
          token.id = undefined;
          token.sub = undefined;
          return token;
        }

        // Sync latest DB state into JWT
        token.role = dbUser.role;
        token.email = dbUser.email;
        token.name = dbUser.name;
        token.dbSyncedAt = Date.now();
      }

      return token;
    },
    session({ session, token }) {
      if (!token.id) {
        // Invalidated token — force re-login
        return { ...session, user: undefined as never };
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "member";
      }
      return session;
    },
  },
});
