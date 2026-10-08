import { db } from "@/lib/db";
import { serviceConfigs } from "@/lib/db/schema";
import { isNull } from "drizzle-orm";
import { getAllLocalPlans } from "@/lib/plans-local";
import { PageHeader } from "@/components/ui/page-header";
import { ServiceConfigForm } from "./service-config-form";
import { ServiceConfigRow } from "./service-config-row";

export default async function ServicesPage() {
  const configs = await db.select().from(serviceConfigs).where(isNull(serviceConfigs.deletedAt));
  const allPlans = await getAllLocalPlans();

  // Enrich configs with plan names
  const enriched = configs.map((c) => ({
    ...c,
    planName: allPlans.find((p) => p.id === c.planId)?.name ?? c.planId,
  }));

  return (
    <div className="space-y-8">
      <PageHeader title="外部服務管理" />

      {/* Create form */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-6">
        <h2 className="mb-4 text-lg font-medium text-text-primary">新增服務</h2>
        <ServiceConfigForm plans={allPlans.map((p) => ({ id: p.id, name: p.name }))} />
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  服務名稱
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  關聯方案
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  Webhook URL
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  狀態
                </th>
                <th className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {enriched.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-text-muted">
                    尚未註冊任何外部服務。新增服務並設定 webhook URL 後，消費者付款完成時將自動通知您的系統。
                  </td>
                </tr>
              )}
              {enriched.map((config) => (
                <ServiceConfigRow key={config.id} config={config} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
