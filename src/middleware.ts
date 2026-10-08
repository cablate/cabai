import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Protected routes: require login
  if (pathname.startsWith("/checkout") || pathname.startsWith("/dashboard") || pathname.startsWith("/content") || pathname.startsWith("/courses")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return Response.redirect(loginUrl);
    }
  }

  // Admin routes: middleware only checks login. The layout/API routes query DB
  // for the authoritative role so stale JWT claims cannot grant or block admin.
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return Response.redirect(new URL("/login", req.url));
    }
  }
});

export const config = {
  matcher: ["/checkout/:path*", "/dashboard/:path*", "/content/:path*", "/courses/:path*", "/admin/:path*"],
};
