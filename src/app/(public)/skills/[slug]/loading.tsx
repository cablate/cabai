import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function Line({ className }: { className: string }) {
  return <Skeleton className={cn("motion-reduce:animate-none", className)} />;
}

export default function Loading() {
  return (
    <section aria-busy="true" aria-label="正在載入 Skill 內容" className="min-h-screen bg-surface">
      <span className="sr-only" role="status">正在載入 Skill 內容</span>
      <div className="bg-surface">
        <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
          <Line className="h-4 w-24" />
          <div className="mt-8 flex max-w-3xl flex-col gap-4">
            <Line className="h-10 w-full max-w-2xl" />
            <Line className="h-5 w-full max-w-xl" />
            <Line className="h-5 w-4/5 max-w-lg" />
            <Line className="h-6 w-48" />
            <Line className="mt-2 h-12 w-full max-w-md" />
          </div>
        </div>
      </div>
      <Line className="h-px w-full rounded-none" />
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-10 sm:px-8 sm:py-14">
        <Line className="h-8 w-40" />
        <Line className="h-5 w-full" />
        <Line className="h-5 w-full" />
        <Line className="h-5 w-11/12" />
        <Line className="mt-6 h-12 w-full" />
        <Line className="h-8 w-40" />
        <Line className="h-5 w-full" />
      </div>
    </section>
  );
}
