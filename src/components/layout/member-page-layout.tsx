import { MemberSidebar } from "./member-sidebar";

interface MemberPageLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout for member pages (dashboard, orders, profile).
 *
 * Desktop: two-column grid with sidebar nav + content.
 * Mobile: single column with horizontal tab bar.
 */
export function MemberPageLayout({ children }: MemberPageLayoutProps) {
  return (
    <div className="pt-4 pb-16 md:pt-10 md:pb-24">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="md:grid md:grid-cols-[240px_1fr] md:gap-10 lg:gap-14">
          <MemberSidebar />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
