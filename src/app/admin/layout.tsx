import { redirect } from "next/navigation";
import { SessionProvider } from "@/components/auth/session-provider";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "sonner";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }

  return (
    <SessionProvider>
      <QueryProvider>
        <ConfirmDialogProvider>
          <Toaster position="top-right" richColors />
          <div className="min-h-screen bg-surface-hover">
            <AdminSidebar />
            <main className="pt-14 p-4 md:ml-64 md:p-8">{children}</main>
          </div>
        </ConfirmDialogProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
