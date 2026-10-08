function Line({ className }: { className: string }) {
  return <div className={`rounded-md bg-surface-muted ${className}`} />;
}

export default function Loading() {
  return (
    <section aria-busy="true" aria-label="正在載入 Skills" className="min-h-screen animate-pulse bg-surface-hover motion-reduce:animate-none">
      <span className="sr-only" role="status">正在載入 Skills</span>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex items-center gap-3 border-b border-border-subtle pb-5">
          <Line className="h-9 w-24" /><Line className="h-6 w-12" />
        </div>
        <div className="flex flex-col gap-3">
          <Line className="h-4 w-24" /><Line className="h-10 w-full" /><Line className="h-8 w-72" /><Line className="h-8 w-full max-w-xl" />
        </div>
        <div>
          <Line className="h-7 w-28" />
          <div className="mt-4 overflow-hidden border-y border-border-subtle bg-surface">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex gap-3 border-b border-border-subtle px-4 py-5 last:border-b-0 sm:px-6 sm:py-6">
                <Line className="size-10 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-3"><Line className="h-6 w-2/3" /><Line className="h-4 w-full" /><Line className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
