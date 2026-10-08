import { db } from "@/lib/db";
import { users, userPurchases } from "@/lib/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { MembersTable, type MemberRow } from "./members-table";

export default async function MembersPage() {
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      purchaseCount: count(userPurchases.id),
    })
    .from(users)
    .leftJoin(userPurchases, eq(users.id, userPurchases.userId))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  // Serialize for client component
  const tableData: MemberRow[] = allUsers.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
    purchaseCount: user.purchaseCount,
  }));

  return (
    <div className="space-y-8">
      <PageHeader title="會員管理" />
      <MembersTable data={tableData} />
    </div>
  );
}
