import { MemberPageLayout } from "@/components/layout/member-page-layout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MemberPageLayout>{children}</MemberPageLayout>;
}
