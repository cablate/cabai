import type { Metadata } from "next";
import { FirstAdminBootstrapCard } from "./first-admin-bootstrap-card";
import { isFirstAdminBootstrapConfigured } from "@/lib/first-admin-bootstrap";

export const metadata: Metadata = {
  title: "首次管理員設定",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function FirstAdminSetupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 pb-24 pt-32">
      <FirstAdminBootstrapCard enabled={isFirstAdminBootstrapConfigured()} />
    </main>
  );
}
