import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ProtectedReliabilityRenderErrorPage() {
  if (process.env.RELIABILITY_TESTS_ENABLED !== "true") notFound();
  throw new Error("CABAI_RELIABILITY_TEST_PROTECTED_RENDER_ERROR");
}
