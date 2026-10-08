import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Google({
      // ===========================================================
      // SECURITY GATE — F-26 account-linking boundary.
      // ===========================================================
      // `allowDangerousEmailAccountLinking: true` is SAFE TODAY only
      // because Google is the *only* OAuth provider and Google forces
      // `email_verified=true`. The moment a second provider is added
      // (GitHub / Apple / SAML / anything that does not strictly
      // verify ownership), this flag becomes an account takeover
      // primitive: an attacker who registers a victim's email at the
      // weaker provider will link into the victim's session.
      //
      // BEFORE ADDING ANY OAUTH PROVIDER:
      //   1. Read the Google OAuth / Auth.js requirements in
      //      docs/architecture/EXTERNAL-INTEGRATIONS.md
      //   2. Flip this flag to false
      //   3. Implement an explicit linking flow that requires the
      //      currently-signed-in user to consent.
      //   4. Decide whether `email_verified` is a hard requirement
      //      for the new provider and enforce it in the signIn
      //      callback.
      // ===========================================================
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "member";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "member";
      }
      return session;
    },
  },
};
