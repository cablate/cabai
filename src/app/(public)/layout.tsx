import { Suspense } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { SessionProvider } from "@/components/auth/session-provider";
import { Toaster } from "sonner";
import { PageViewTracker } from "@/components/page-view-tracker";
import {
  getCachedPublishedLibraryEntries,
  getCachedPublicSkills,
} from "@/lib/public-site-cache";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [library, skills] = await Promise.all([
    getCachedPublishedLibraryEntries(),
    getCachedPublicSkills(),
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        跳到主要內容
      </a>
      <Toaster position="top-right" richColors />
      <Header contentAvailability={contentAvailability} />
      <main id="main-content" className="pt-[var(--site-header-height)]">{children}</main>
      <Footer contentAvailability={contentAvailability} />
    </SessionProvider>
  );
}
