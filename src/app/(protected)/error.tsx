"use client";

import { AppErrorState } from "@/components/ui/states/app-error-state";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppErrorState
      contextLabel="會員中心"
      title="這個會員頁面暫時打不開"
      description="你的帳號和已購買內容不會因此改變。先再試一次，或回會員中心繼續看其他內容。"
      reset={reset}
      destinationHref="/dashboard"
      destinationLabel="回到會員中心"
      errorId={error.digest}
      error={error}
      surface="protected-error"
      className="min-h-[calc(100vh-var(--site-header-height))] [min-block-size:calc(100dvb-var(--site-header-height))]"
    />
  );
}
