export default function CheckoutLoading() {
  return (
    <main className="min-h-screen bg-surface-hover px-4 pb-16 pt-24 sm:px-6 sm:pt-28" aria-busy="true" aria-label="正在載入購買確認頁">
      <div className="mx-auto w-full max-w-6xl animate-pulse motion-reduce:animate-none">
        <div className="h-4 w-24 rounded bg-surface-muted" />
        <div className="mt-8 h-9 w-56 rounded bg-surface-muted" />
        <div className="mt-3 h-5 max-w-xl rounded bg-surface-muted" />

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
              <div className="h-12 border-b border-border-subtle" />
              <div className="aspect-[16/7] bg-surface-muted sm:aspect-[16/6]" />
              <div className="space-y-3 p-6">
                <div className="h-6 w-3/4 rounded bg-surface-muted" />
                <div className="h-4 w-1/2 rounded bg-surface-muted" />
                <div className="h-16 rounded-xl bg-surface-muted" />
              </div>
            </div>
            <div className="h-48 rounded-2xl border border-border-subtle bg-surface" />
          </div>
          <div className="h-[31rem] rounded-2xl border border-border-subtle bg-surface" />
        </div>
      </div>
    </main>
  );
}
