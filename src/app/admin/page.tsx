import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  FilePlus,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import {
  getAdminOperationsOverview,
  type AdminOperationItem,
} from "@/lib/admin-operations";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { adminOperationSignalLabels } from "@/lib/agent/operations-schemas";

const toneStyles = {
  critical: {
    card: "border-danger/25 bg-danger-light/40",
    icon: "bg-danger-light text-danger",
    count: "text-danger",
  },
  warning: {
    card: "border-warning/25 bg-warning-light/35",
    icon: "bg-warning-light text-warning",
    count: "text-warning",
  },
  work: {
    card: "border-border-subtle bg-surface",
    icon: "bg-surface-muted text-text-secondary",
    count: "text-text-primary",
  },
} as const;

function OperationCard({ item }: { item: AdminOperationItem }) {
  const styles = toneStyles[item.tone];

  return (
    <Link prefetch={false}
      href={item.href}
      className={`group flex min-h-44 flex-col rounded-2xl border p-5 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:translate-y-0 ${styles.card}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`grid size-10 place-items-center rounded-xl ${styles.icon}`}>
          {item.tone === "work" ? <FilePlus size={21} /> : <WarningCircle size={21} weight="fill" />}
        </span>
        <span className={`font-mono text-3xl font-semibold ${styles.count}`}>
          {item.count ?? "未知"}
        </span>
      </div>
      <h2 className="mt-5 font-semibold text-text-primary">{item.label}</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{item.description}</p>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-text-primary">
        前往處理
        <ArrowRight
          size={15}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}

export default async function AdminDashboard() {
  const overview = await getAdminOperationsOverview();
  const allClear = overview.status === "ok" && overview.total === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader
        title="今日工作台"
        description="先處理異常，再完成尚未發布或交付的內容。"
      />

      {overview.completeness === "partial" && (
        <Card role="status" aria-live="polite" className="border-warning/25 bg-warning-light/35 p-5">
          <h2 className="font-semibold text-text-primary">部分工作狀態暫時無法讀取</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            未知項目會標示為「未知」，不會當成 0；請稍後重試，並留意下列資料來源。
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-text-secondary">
            {overview.unavailableSignals.map((signal) => (
              <li key={signal}>{adminOperationSignalLabels[signal]}</li>
            ))}
          </ul>
        </Card>
      )}

      {allClear ? (
        <Card className="overflow-hidden border-success/20 bg-success-light/45 p-0">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-light text-success">
                <CheckCircle size={24} weight="fill" />
              </span>
              <div>
                <h2 className="font-semibold text-text-primary">目前沒有待處理項目</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  沒有交付異常、逾時訂單、孤兒媒體或尚未完成的草稿。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link prefetch={false} href="/admin/information/new">建立公告</Link>
              </Button>
              <Button asChild>
                <Link prefetch={false} href="/admin/courses">管理課程</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {overview.urgent.length > 0 && (
            <section aria-labelledby="urgent-heading">
              <div className="mb-4">
                <h2 id="urgent-heading" className="text-lg font-semibold text-text-primary">
                  優先排查
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  這些狀態可能影響付款、權限交付或內容資產。
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {overview.urgent.map((item) => <OperationCard key={item.id} item={item} />)}
              </div>
            </section>
          )}

          {overview.work.length > 0 && (
            <section aria-labelledby="work-heading">
              <div className="mb-4">
                <h2 id="work-heading" className="text-lg font-semibold text-text-primary">
                  待完成內容
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  草稿不是錯誤；這裡集中尚待補齊、確認或發布的工作。
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {overview.work.map((item) => <OperationCard key={item.id} item={item} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
