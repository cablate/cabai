"use client";

import { AppErrorState } from "@/components/ui/states/app-error-state";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppErrorState
      contextLabel="管理後台"
      title="後台這個頁面暫時打不開"
      description="剛才的操作不一定有送出，重新操作前先確認目前狀態。你可以再試一次，或先回後台首頁。"
      reset={reset}
      destinationHref="/admin"
      destinationLabel="回到後台首頁"
      errorId={error.digest}
      error={error}
      surface="admin-error"
      className="min-h-[calc(100vh-4.5rem)] [min-block-size:calc(100dvb-4.5rem)] md:min-h-[calc(100vh-4rem)] md:[min-block-size:calc(100dvb-4rem)]"
    />
  );
}
