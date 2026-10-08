import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, ArrowRight, BookOpen, FileText, Plugs } from "@phosphor-icons/react/dist/ssr";
import type { LocalPlan } from "@/lib/plans-local";
import type { DeliveryOverview } from "@/lib/delivery";

interface ProvisioningStatus {
  total: number;
  sent: number;
  pending: number;
  deadLetter: number;
}

export interface DashboardItem {
  id: string;
  planId: string;
  plan?: LocalPlan;
  source: "local" | "subscription";
  billingPeriod?: string;
  status?: string;
  grantedAt?: Date;
  expiresAt?: Date | null;
  nextBillingAt?: Date;
  cancelAtPeriodEnd?: boolean;
  orderId?: string;
  provisioning?: ProvisioningStatus;
  delivery?: DeliveryOverview;
}

export function DashboardCard({
  item,
  typeLabel,
}: {
  item: DashboardItem;
  typeLabel: Record<string, string>;
}) {
  const billingPeriod = item.plan?.billingPeriod ?? item.billingPeriod ?? "one-time";
  const label = typeLabel[billingPeriod] ?? billingPeriod;
  const delivery = item.delivery;
  const primaryAction = delivery?.primaryAction ?? {
    href: `/content/${item.planId}`,
    label: "查看內容",
    note: "會員內容",
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-border hover:shadow-card">
      {/* Cover image */}
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-muted">
        {item.plan?.image ? (
          <Image
            src={item.plan.image}
            alt={item.plan?.name ?? ""}
            fill
            className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag size={32} className="text-text-muted" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-[10px] uppercase text-text-muted font-medium">
            {label}
          </span>
          {item.cancelAtPeriodEnd && (
            <span className="inline-flex items-center rounded-full bg-warning-light px-3 py-1 text-[10px] uppercase text-warning font-medium">
              即將到期
            </span>
          )}
          {item.status === "past_due" && (
            <span className="inline-flex items-center rounded-full bg-danger-light px-3 py-1 text-[10px] uppercase text-danger font-medium">
              付款失敗
            </span>
          )}
          {item.provisioning && item.provisioning.total > 0 && (
            <>
              {item.provisioning.sent === item.provisioning.total && (
                <span className="inline-flex items-center rounded-full bg-success-light px-3 py-1 text-[10px] uppercase text-success font-medium">
                  已開通
                </span>
              )}
              {item.provisioning.pending > 0 && (
                <span className="inline-flex items-center rounded-full bg-info-light px-3 py-1 text-[10px] uppercase text-info font-medium">
                  開通中
                </span>
              )}
              {item.provisioning.deadLetter > 0 && (
                <span className="inline-flex items-center rounded-full bg-danger-light px-3 py-1 text-[10px] uppercase text-danger font-medium">
                  開通異常
                </span>
              )}
            </>
          )}
        </div>
        <h3 className="text-base font-semibold text-text-primary leading-snug">
          {item.plan?.name ?? item.planId}
        </h3>
        {item.plan?.description && (
          <p className="mt-2 flex-1 text-sm text-text-secondary leading-relaxed line-clamp-2">
            {item.plan.description}
          </p>
        )}
        {delivery?.hasDelivery ? (
          <div className="mt-4 grid gap-2 text-xs text-text-secondary">
            {delivery.courseCount > 0 && (
              <DeliveryLine
                icon={<BookOpen size={14} weight="duotone" />}
                text={`${delivery.courseCount} 門課程，${delivery.completedLessonCount}/${delivery.lessonCount} 章節完成`}
              />
            )}
            {delivery.contentCount > 0 && (
              <DeliveryLine
                icon={<FileText size={14} weight="duotone" />}
                text={`${delivery.contentCount} 個檔案或內容`}
              />
            )}
            {delivery.activeServiceCount > 0 && (
              <DeliveryLine
                icon={<Plugs size={14} weight="duotone" />}
                text={`${delivery.activeServiceCount} 個服務項目`}
              />
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-warning">
            付款紀錄已建立，交付內容尚未設定完成。
          </p>
        )}
        <div className="mt-2 text-xs text-text-muted">
          {item.grantedAt && (
            <>
              購買日期：
              {item.grantedAt.toLocaleDateString("zh-TW", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </>
          )}
          {item.expiresAt && (
            <span className="ml-2">
              · 到期：
              {item.expiresAt.toLocaleDateString("zh-TW", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
          {item.nextBillingAt && (
            <>
              下次扣款：
              {item.nextBillingAt.toLocaleDateString("zh-TW", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </>
          )}
        </div>
        <Link prefetch={false}
          href={primaryAction.href}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-sm font-medium text-text-inverted transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90 active:scale-[0.98]"
        >
          {primaryAction.label}
          <ArrowRight size={14} weight="bold" />
        </Link>
      </div>
    </div>
  );
}

function DeliveryLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
