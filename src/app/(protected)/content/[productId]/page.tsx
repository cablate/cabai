import { redirect } from "next/navigation";

interface ContentPageProps {
  params: Promise<{ productId: string }>;
}

/**
 * Legacy /content/[productId] route.
 * All content delivery now goes through /my/[productId] → courses → lessons.
 */
export default async function ContentPage({ params }: ContentPageProps) {
  const { productId } = await params;
  redirect(`/my/${productId}`);
}
