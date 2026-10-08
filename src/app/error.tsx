"use client";

import { AppErrorState } from "@/components/ui/states/app-error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppErrorState
      contextLabel="頁面暫時沒載入成功"
      title="這個頁面剛剛出了點狀況"
      description="先再試一次看看。如果還是打不開，可以先回首頁，晚一點再回來。"
      reset={reset}
      destinationHref="/"
      destinationLabel="回到首頁"
      errorId={error.digest}
      error={error}
      surface="public-error"
      className="min-h-screen [min-block-size:100dvb]"
    />
  );
}
