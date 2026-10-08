import type { Metadata } from "next";
import { LibraryIndex } from "@/components/public/library/library-index";
import { listPublishedLibraryEntries } from "@/lib/services/library-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Agent 工程文章、工具排查與工作方法",
  description: "免費閱讀 CabAI 整理的 AI Agent 工程文章、Codex 與 Claude Code 工具排查、實作方法及工作流程。",
  alternates: { canonical: "/library" },
  openGraph: {
    title: "CabAI Library｜AI Agent 工程文章與實作指南",
    description: "閱讀 AI Agent 工程文章、Codex 與 Claude Code 工具排查、實作方法及工作流程。",
    url: "/library",
    type: "website",
  },
};

export default async function LibraryPage() {
  const result = await listPublishedLibraryEntries();
  if (!result.ok) throw new Error(`Library list unavailable: ${result.kind}`);
  return <LibraryIndex entries={result.value} />;
}
