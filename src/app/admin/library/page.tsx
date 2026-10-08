import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { LibraryStatusBadge } from "@/components/admin/library/status-badge";
import { listLibraryEntries } from "@/lib/services/library-service";

export default async function AdminLibraryPage() {
  const result = await listLibraryEntries();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Library 管理"
        description="建立與治理免費 Markdown 知識內容；發佈時會連同必要的 Information 原子處理。"
        actions={(
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link prefetch={false} href="/admin/library/home-classification">首頁分類預覽</Link>
            </Button>
            <Button asChild>
              <Link prefetch={false} href="/admin/library/new">建立 Library</Link>
            </Button>
          </div>
        )}
      />

      {!result.ok ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-light p-5 text-sm text-danger">
          <p className="font-semibold">Library 清單無法載入</p>
          <p className="mt-1">{result.message}（{result.kind}）</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">標題</th>
                  <th scope="col" className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">狀態</th>
                  <th scope="col" className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">修訂</th>
                  <th scope="col" className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">更新時間</th>
                  <th scope="col" className="px-6 py-3.5 text-xs font-medium uppercase text-text-muted">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {result.value.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-text-muted">
                      尚未建立 Library 內容。先建立草稿，再完成 readiness 與 Information 後發佈。
                    </td>
                  </tr>
                )}
                {result.value.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-muted">
                    <td className="px-6 py-4">
                      <p className="font-medium text-text-primary">{entry.title}</p>
                      <p className="mt-1 max-w-xl truncate text-xs text-text-muted">/{entry.slug}</p>
                    </td>
                    <td className="px-6 py-4"><LibraryStatusBadge status={entry.status} /></td>
                    <td className="px-6 py-4 font-mono text-text-secondary">{entry.revision}</td>
                    <td className="px-6 py-4 text-text-secondary">
                      <time dateTime={entry.updatedAt.toISOString()}>{entry.updatedAt.toLocaleString("zh-TW")}</time>
                    </td>
                    <td className="px-6 py-4">
                      <Link prefetch={false} href={`/admin/library/${entry.id}`} className="font-medium text-accent hover:text-success">
                        管理
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
