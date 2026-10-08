"use client";

import { AppErrorState } from "@/components/ui/states/app-error-state";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppErrorState
      contextLabel="Information 載入遇到問題"
      title="最新消息暫時打不開"
      description="目前無法取得公開公告，請稍後再試。"
      reset={reset}
      destinationHref="/information"
      destinationLabel="重新載入"
      error={error}
      errorId={error.digest}
      surface="public-information"
    />
  );
}
