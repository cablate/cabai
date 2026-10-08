import { Skeleton } from "@/components/ui/skeleton";

export default function CourseDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Skeleton className="h-4 w-24 mb-2" />
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-4 w-96" />

      {/* Progress bar skeleton */}
      <div className="mt-6 rounded-xl border border-zinc-200/60 bg-white p-4">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="mt-2 h-2 w-full rounded-full" />
      </div>

      {/* Lesson list skeleton */}
      <div className="mt-8 space-y-6">
        <Skeleton className="h-4 w-20" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
