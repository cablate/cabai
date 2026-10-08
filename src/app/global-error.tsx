"use client";

import { AppErrorState } from "@/components/ui/states/app-error-state";
import { BRAND_NAME } from "@/lib/constants";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-TW">
      <body className="m-0 min-h-screen bg-surface-hover text-text-primary antialiased">
        <AppErrorState
          contextLabel="網站載入遇到問題"
          title={`${BRAND_NAME} 剛剛沒載入成功`}
          description="先再試一次。如果還是打不開，可以先回首頁，晚一點再回來。"
          reset={reset}
          destinationHref="/"
          destinationLabel="回到首頁"
          errorId={error.digest}
          error={error}
          surface="global-error"
          className="min-h-screen [min-block-size:100dvb]"
        />
      </body>
    </html>
  );
}
