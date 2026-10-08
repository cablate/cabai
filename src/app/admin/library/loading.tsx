export default function AdminLibraryLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="正在載入 Library 管理介面">
      <div className="h-28 animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-36 animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none" />
        <div className="h-36 animate-pulse rounded-xl bg-surface-muted motion-reduce:animate-none" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none" />
    </div>
  );
}
