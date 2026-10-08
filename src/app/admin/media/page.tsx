import { db } from "@/lib/db";
import { media, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import Image from "next/image";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "上傳中", color: "bg-amber-50 text-amber-700" },
  confirmed: { label: "使用中", color: "bg-emerald-50 text-emerald-700" },
  orphaned: { label: "孤兒", color: "bg-red-50 text-red-700" },
  deleted: { label: "已刪除", color: "bg-zinc-100 text-zinc-500" },
};

const CONTEXT_LABELS: Record<string, string> = {
  "plan-cover": "方案封面",
  "plan-banner": "方案橫幅",
  "course-image": "課程圖片",
  "lesson-thumbnail": "課堂縮圖",
  "lesson-content": "課堂內容",
  "service-guide": "服務指南",
};

interface MediaPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const statusFilter = params.status;
  const where = statusFilter ? eq(media.status, statusFilter as "pending" | "confirmed" | "orphaned" | "deleted") : undefined;

  const items = await db
    .select({
      id: media.id,
      filename: media.filename,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      context: media.context,
      status: media.status,
      publicUrl: media.publicUrl,
      entityType: media.entityType,
      entityId: media.entityId,
      createdAt: media.createdAt,
      uploadedBy: media.uploadedBy,
    })
    .from(media)
    .where(where)
    .orderBy(desc(media.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Resolve uploader names
  const uploaderIds = [...new Set(items.map((i) => i.uploadedBy))];
  const uploaderMap = new Map<string, string>();
  for (const uid of uploaderIds) {
    const u = await db.query.users.findFirst({
      where: eq(users.id, uid),
      columns: { name: true, email: true },
    });
    if (u) uploaderMap.set(uid, u.name || u.email || uid.slice(0, 8));
  }

  // Stats
  const allMedia = await db
    .select({ status: media.status, fileSize: media.fileSize })
    .from(media);

  const stats = {
    total: allMedia.length,
    confirmed: allMedia.filter((m) => m.status === "confirmed").length,
    orphaned: allMedia.filter((m) => m.status === "orphaned").length,
    pending: allMedia.filter((m) => m.status === "pending").length,
    totalSize: allMedia.reduce((sum, m) => sum + m.fileSize, 0),
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    }).format(date);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="媒體管理"
        description="瀏覽和管理所有上傳到 R2 的檔案"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="總計" value={stats.total} />
        <StatCard label="使用中" value={stats.confirmed} />
        <StatCard label="上傳中" value={stats.pending} />
        <StatCard label="孤兒" value={stats.orphaned} highlight={stats.orphaned > 0} />
        <StatCard label="總大小" value={formatSize(stats.totalSize)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterLink label="全部" href="/admin/media" active={!statusFilter} />
        <FilterLink label="使用中" href="/admin/media?status=confirmed" active={statusFilter === "confirmed"} />
        <FilterLink label="上傳中" href="/admin/media?status=pending" active={statusFilter === "pending"} />
        <FilterLink label="孤兒" href="/admin/media?status=orphaned" active={statusFilter === "orphaned"} />
      </div>

      {/* Media table */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-white py-16 text-center">
          <p className="text-text-muted">尚無媒體檔案</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-hover text-left text-xs font-medium uppercase text-text-muted">
                <th className="px-4 py-3">檔案</th>
                <th className="px-4 py-3">用途</th>
                <th className="px-4 py-3">狀態</th>
                <th className="px-4 py-3">大小</th>
                <th className="px-4 py-3">關聯</th>
                <th className="px-4 py-3">上傳者</th>
                <th className="px-4 py-3">時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {items.map((item) => {
                const st = STATUS_LABELS[item.status] ?? { label: item.status, color: "bg-zinc-100 text-zinc-600" };
                const isImage = item.mimeType.startsWith("image/");
                return (
                  <tr key={item.id} className="hover:bg-surface-hover/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {isImage ? (
                          <Image
                            src={item.publicUrl}
                            alt={item.filename}
                            width={40}
                            height={40}
                            unoptimized
                            className="h-10 w-10 rounded object-cover border border-border-subtle"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-surface-hover text-xs text-text-muted">
                            {item.mimeType.split("/")[1]?.toUpperCase().slice(0, 4) || "FILE"}
                          </div>
                        )}
                        <span className="text-xs text-text-primary truncate max-w-[200px]" title={item.filename}>
                          {item.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {CONTEXT_LABELS[item.context] || item.context}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted font-mono">{formatSize(item.fileSize)}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {item.entityType ? (
                        <span>{item.entityType} <span className="font-mono">{item.entityId?.slice(0, 8)}</span></span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {uploaderMap.get(item.uploadedBy) || item.uploadedBy.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted font-mono">
                      {formatDate(item.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">第 {page} 頁 ({items.length} 筆)</span>
        <div className="flex gap-2">
          {page > 1 && (
            <a
              href={`/admin/media?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
            >
              上一頁
            </a>
          )}
          {items.length === pageSize && (
            <a
              href={`/admin/media?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
            >
              下一頁
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${highlight ? "border-red-200 bg-red-50" : "border-border-subtle bg-white"}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-red-700" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-ink text-white" : "bg-surface-hover text-text-secondary hover:bg-surface-muted"
      }`}
    >
      {label}
    </a>
  );
}
