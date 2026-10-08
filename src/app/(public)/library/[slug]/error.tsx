"use client";

import { LibraryErrorState } from "@/components/public/library/library-error-state";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <LibraryErrorState reset={reset} detail errorId={error.digest} error={error} />;
}
