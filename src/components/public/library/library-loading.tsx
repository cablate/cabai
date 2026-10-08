import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function Line({ className }: { className: string }) {
  return <Skeleton className={cn("motion-reduce:animate-none", className)} />;
}

export function LibraryListLoading() {
  return (
    <div aria-busy="true" aria-label="正在載入 Library" className="min-h-[70vh] animate-pulse bg-surface-hover/45">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex items-center gap-3 border-b border-border-subtle pb-5">
          <Line className="h-9 w-28" /><Line className="h-6 w-12" />
        </div>
        <div className="flex flex-col gap-3">
          <Line className="h-4 w-24" /><Line className="h-10 w-full" /><Line className="h-8 w-64" />
        </div>
        <div>
          <Line className="h-7 w-24" />
          <div className="mt-4 overflow-hidden border-y border-border-subtle bg-surface">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex flex-col gap-3 border-b border-border-subtle px-4 py-5 last:border-b-0 sm:px-6 sm:py-6">
                <Line className="h-3 w-24" /><Line className="h-7 w-4/5" /><Line className="h-4 w-full" /><Line className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LibraryDetailLoading() {
  return (
    <div aria-busy="true" aria-label="正在載入 Library 文章" className="min-h-[70vh] bg-surface">
      <div className="bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
          <Line className="h-4 w-28" />
          <div className="mt-8 flex max-w-3xl flex-col gap-4">
            <Line className="h-10 w-full max-w-2xl" />
            <Line className="h-5 w-full max-w-xl" />
            <Line className="h-5 w-4/5 max-w-lg" />
            <Line className="h-6 w-48" />
          </div>
        </div>
      </div>
      <Line className="h-px w-full rounded-none" />
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-10 sm:px-8 sm:py-14">
        <Line className="h-5 w-full" />
        <Line className="h-5 w-full" />
        <Line className="h-5 w-11/12" />
        <Line className="mt-6 h-5 w-full" />
        <Line className="h-5 w-5/6" />
      </div>
    </div>
  );
}
