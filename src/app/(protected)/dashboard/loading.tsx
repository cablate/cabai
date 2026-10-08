import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="pt-16 pb-24">
      <div className="max-w-7xl mx-auto px-6 md:px-8">
        {/* Header skeleton */}
        <div className="mb-12 border-b border-zinc-200/60 pb-8">
          <Skeleton className="h-5 w-20 rounded-full mb-4" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64 mt-2" />
        </div>

        {/* Card grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-200/60 bg-white overflow-hidden">
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <div className="p-6 space-y-3">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full rounded-full mt-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
