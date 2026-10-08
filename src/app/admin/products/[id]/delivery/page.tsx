import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowSquareOut,
  BookOpen,
  CheckCircle,
  FileText,
  Package,
  Plugs,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { getDeliveryOverviewForPlan } from "@/lib/delivery";
import { getLocalPlan } from "@/lib/plans-local";
import { formatPrice } from "@/lib/utils";
import { deletePlanContent } from "./actions";
import { PlanContentForm } from "./plan-content-form";

interface ProductDeliveryPageProps {
  params: Promise<{ id: string }>;
}

const billingLabels: Record<string, string> = {
  "one-time": "單次購買",
  monthly: "月訂閱",
  yearly: "年訂閱",
};

const contentTypeLabels: Record<string, string> = {
  video: "影片",
  pdf: "PDF",
  text: "文字",
  download: "下載",
};

export default async function ProductDeliveryPage({ params }: ProductDeliveryPageProps) {
  const { id } = await params;
  const plan = await getLocalPlan(id);

  if (!plan) notFound();

  const delivery = await getDeliveryOverviewForPlan(id, undefined, { includeUnpublished: true });
  const deliveryCount = delivery.courseCount + delivery.contentCount + delivery.activeServiceCount;

  return (
    <div className="space-y-8">
      <Link prefetch={false}
        href="/admin/products"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={14} weight="bold" />
        返回商品管理
      </Link>

      <PageHeader
        eyebrow="Delivery"
        title="商品交付設定"
        description="把 Portaly 方案接到站內課程、檔案內容或外部服務，付款完成後消費者會從會員中心取得。"
        actions={
          <>
            <Link prefetch={false}
              href={`/products/${plan.id}`}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-muted"
            >
              商品頁
              <ArrowSquareOut size={14} weight="bold" />
            </Link>
            <Link prefetch={false}
              href={`/content/${plan.id}`}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              會員內容頁
              <ArrowSquareOut size={14} weight="bold" />
            </Link>
          </>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-muted text-text-secondary">
              <Package size={20} weight="duotone" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{plan.name}</h2>
              <p className="text-sm text-text-muted">{plan.id}</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <InfoRow label="價格" value={formatPrice(plan.amount)} />
            <InfoRow label="類型" value={billingLabels[plan.billingPeriod] ?? plan.billingPeriod} />
            <InfoRow label="狀態" value={plan.status === "active" ? "上架中" : "未上架"} />
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">交付狀態</h2>
              <p className="mt-1 text-sm text-text-muted">
                {delivery.hasDelivery
                  ? `目前有 ${deliveryCount} 個交付入口。`
                  : "目前還沒有設定付款後可取得的內容。"}
              </p>
            </div>
            <Badge variant={delivery.hasDelivery ? "success" : "warning"}>
              {delivery.hasDelivery ? "可交付" : "待設定"}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusTile
              icon={<BookOpen size={20} weight="duotone" />}
              label="課程"
              value={`${delivery.courseCount} 門`}
              detail={`${delivery.lessonCount} 個章節`}
              ready={delivery.courseCount > 0}
            />
            <StatusTile
              icon={<FileText size={20} weight="duotone" />}
              label="檔案與內容"
              value={`${delivery.contentCount} 個`}
              detail="文字 / PDF / 下載 / 影片"
              ready={delivery.contentCount > 0}
            />
            <StatusTile
              icon={<Plugs size={20} weight="duotone" />}
              label="外部服務"
              value={`${delivery.activeServiceCount} 個`}
              detail="付款後自動開通"
              ready={delivery.activeServiceCount > 0}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">課程交付</h2>
              <p className="mt-1 text-sm text-text-muted">適合有章節、進度、單元頁的商品。</p>
            </div>
            <Link prefetch={false}
              href="/admin/courses"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-muted"
            >
              管理課程
              <ArrowSquareOut size={14} weight="bold" />
            </Link>
          </div>

          {delivery.courses.length === 0 ? (
            <EmptyBlock title="尚未連接課程" />
          ) : (
            <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {delivery.courses.map((course) => (
                <div key={course.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium text-text-primary">{course.title}</p>
                    <p className="text-sm text-text-muted">{course.lessonCount} 個章節</p>
                  </div>
                  <Link prefetch={false}
                    href={`/admin/courses/${course.id}`}
                    className="text-sm font-medium text-accent hover:text-success"
                  >
                    管理
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">外部服務交付</h2>
              <p className="mt-1 text-sm text-text-muted">適合訂閱服務、社群權限、顧問排程或其他系統開通。</p>
            </div>
            <Link prefetch={false}
              href="/admin/services"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-muted"
            >
              管理服務
              <ArrowSquareOut size={14} weight="bold" />
            </Link>
          </div>

          {delivery.services.length === 0 ? (
            <EmptyBlock title="尚未連接外部服務" />
          ) : (
            <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {delivery.services.map((service) => (
                <div key={service.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium text-text-primary">{service.serviceName}</p>
                    <p className="text-sm text-text-muted">{service.isActive ? "啟用中" : "已停用"}</p>
                  </div>
                  <Badge variant={service.isActive ? "success" : "default"}>
                    {service.isActive ? "啟用" : "停用"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-text-primary">檔案與內容交付</h2>
          <p className="mt-1 text-sm text-text-muted">
            這些項目會直接出現在消費者的會員內容頁。
          </p>
        </div>

        <PlanContentForm planId={plan.id} nextSortOrder={delivery.contentCount} />

        <div className="mt-6">
          {delivery.contents.length === 0 ? (
            <EmptyBlock title="尚未新增檔案或內容" />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <div className="overflow-x-auto">
                <table className="min-w-[560px] w-full text-left text-sm">
                  <thead className="bg-surface-muted/60">
                    <tr>
                      <th className="px-4 py-3 font-medium text-text-muted">排序</th>
                      <th className="px-4 py-3 font-medium text-text-muted">標題</th>
                      <th className="px-4 py-3 font-medium text-text-muted">類型</th>
                      <th className="px-4 py-3 text-right font-medium text-text-muted">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {delivery.contents.map((content) => (
                      <tr key={content.id}>
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">
                          {content.sortOrder}
                        </td>
                        <td className="px-4 py-3 font-medium text-text-primary">
                          {content.title}
                        </td>
                        <td className="px-4 py-3 text-text-muted">
                          {contentTypeLabels[content.type] ?? content.type}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <form
                            action={async () => {
                              "use server";
                              await deletePlanContent(content.id, plan.id);
                            }}
                          >
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-light"
                            >
                              <Trash size={13} />
                              刪除
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle pb-3 last:border-0 last:pb-0">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}

function StatusTile({
  icon,
  label,
  value,
  detail,
  ready,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-hover p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-text-muted">{icon}</span>
        {ready && <CheckCircle size={16} weight="fill" className="text-success" />}
      </div>
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{detail}</p>
    </div>
  );
}

function EmptyBlock({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-hover px-4 py-8 text-center text-sm text-text-muted">
      {title}
    </div>
  );
}
