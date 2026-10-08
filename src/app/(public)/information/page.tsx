import type { Metadata } from "next";
import { listPublishedPublicInformation } from "@/lib/services/information-service";
import { InformationIndex } from "@/components/public/information/information-index";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "最新消息、功能與內容更新",
  description: "查看 CabAI 最新平台公告、AI 課程、Library、Agent Skills 與 Agent API 更新。",
  alternates: { canonical: "/information" },
  openGraph: {
    title: "CabAI 最新消息、功能與內容更新",
    description: "查看 CabAI 最新平台公告、AI 課程、Library、Agent Skills 與 Agent API 更新。",
    url: "/information",
    type: "website",
  },
};

export default async function InformationPage() {
  const result = await listPublishedPublicInformation();
  if (!result.ok) throw new Error("Public Information unavailable");

  return <InformationIndex items={result.value} />;
}
