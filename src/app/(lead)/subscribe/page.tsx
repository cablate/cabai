import type { Metadata } from "next";
import { SubscribePage } from "@/components/join/subscribe-page";
import { BRAND_NAME } from "@/lib/constants";
import { getSubscribePage } from "@/lib/subscribe-page";

export const dynamic = "force-dynamic";

const page = getSubscribePage();

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: "/subscribe" },
  robots: { index: false, follow: true },
  openGraph: {
    title: page.title,
    description: page.description,
    url: "/subscribe",
    type: "website",
    siteName: BRAND_NAME,
  },
};

export default function Page() {
  return <SubscribePage page={page} />;
}
