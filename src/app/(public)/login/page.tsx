import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginCard } from "./login-card";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登入",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const session = await auth();

  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 pb-24 pt-32">
      <LoginCard callbackUrl={callbackUrl} googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim())} />
    </main>
  );
}
