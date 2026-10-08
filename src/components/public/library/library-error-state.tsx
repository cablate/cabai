"use client";

import { AppErrorState } from "@/components/ui/states/app-error-state";

export function LibraryErrorState({
  reset,
  detail = false,
  errorId,
  error,
}: {
  reset: () => void;
  detail?: boolean;
  errorId?: string;
  error?: unknown;
}) {
  return (
    <AppErrorState
      contextLabel="Library 載入遇到問題"
      title={detail ? "這篇文章暫時無法載入" : "Library 暫時無法載入"}
      description="內容服務目前沒有正常回應。你可以再試一次，或先回到 Library 瀏覽其他文章。"
      reset={reset}
      destinationHref="/library"
      destinationLabel="回到 Library"
      errorId={errorId}
      error={error}
      surface={detail ? "public-library-detail" : "public-library-list"}
      className="min-h-[65dvh]"
    />
  );
}
