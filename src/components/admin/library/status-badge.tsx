const statusStyles = {
  draft: "bg-zinc-100 text-zinc-700",
  published: "bg-emerald-50 text-emerald-700",
  withdrawn: "bg-amber-50 text-amber-800",
} as const;

const statusLabels = {
  draft: "草稿",
  published: "已發佈",
  withdrawn: "已下架",
} as const;

export function LibraryStatusBadge({ status }: { status: string }) {
  const style = statusStyles[status as keyof typeof statusStyles] ?? "bg-zinc-100 text-zinc-700";
  const label = statusLabels[status as keyof typeof statusLabels] ?? status;
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${style}`}>{label}</span>;
}
