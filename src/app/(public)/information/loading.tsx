export default function Loading() {
  return (
    <section className="min-h-[calc(100dvh-var(--site-header-height))] bg-surface-hover">
      <div className="mx-auto max-w-4xl animate-pulse px-5 py-10 sm:px-8 sm:py-14 motion-reduce:animate-none">
        <div className="h-4 w-16 rounded bg-surface-muted" />
        <div className="mt-5 h-10 w-48 rounded bg-surface-muted" />
        <div className="mt-4 h-5 max-w-xl rounded bg-surface-muted" />
        <div className="mt-8 border-t border-border-subtle pt-8">
          <div className="h-32 rounded-xl border border-border-subtle bg-surface" />
        </div>
      </div>
    </section>
  );
}
