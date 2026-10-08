import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-6xl font-bold text-zinc-200">404</p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">找不到頁面</h1>
        <p className="mt-2 text-sm text-zinc-500">
          您要尋找的頁面不存在或已被移動。
        </p>
        <div className="mt-6">
          <Button asChild variant="secondary">
            <Link prefetch={false} href="/">返回首頁</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
