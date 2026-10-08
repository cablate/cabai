import { Skeleton } from "@/components/ui/skeleton";

export default function MembersLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-32" />
      <div className="rounded-2xl border border-zinc-200/60 bg-white overflow-hidden">
        <div className="border-b border-zinc-200/60 px-6 py-3.5 flex gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b border-zinc-100 px-6 py-4 flex gap-6">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
