"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopySourceIdButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-8 px-2"
      onClick={copy}
      aria-label={copied ? "來源 ID 已複製" : "複製來源 ID"}
    >
      {copied ? "已複製" : "複製 ID"}
    </Button>
  );
}
