import { Suspense } from "react";
import Link from "next/link";
import { SessionProvider } from "@/components/auth/session-provider";
import { Header } from "@/components/layout/header";
import { Toaster } from "sonner";
import { PageViewTracker } from "@/components/page-view-tracker";
import { CONTACT_EMAIL } from "@/lib/config/site-identity";
import { listPublishedLibraryEntries } from "@/lib/services/library-service";
import { listPublicSkills } from "@/lib/services/skill-release-service";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [library, skills] = await Promise.all([
    listPublishedLibraryEntries(),
    listPublicSkills({ authenticated: false }),
  ]);
  const contentAvailability = {
    library: library.ok && library.value.length > 0,
    skills: skills.ok && skills.value.length > 0,
  };

  return (
    <SessionProvider>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <Toaster position="top-right" richColors />
      <Header contentAvailability={contentAvailability} />
      <main className="min-h-screen bg-surface-hover pt-[var(--site-header-height)]">{children}</main>
      <footer className="border-t border-border-subtle bg-surface py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 text-xs text-text-muted">
          <div className="flex gap-4">
            <Link prefetch={false} href="/privacy" className="hover:text-text-primary">隱私政策</Link>
            <Link prefetch={false} href="/terms" className="hover:text-text-primary">服務條款</Link>
          </div>
          <a className="transition-colors hover:text-text-secondary" href={`mailto:${CONTACT_EMAIL}`}>
            聯絡我們：{CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </SessionProvider>
  );
}
