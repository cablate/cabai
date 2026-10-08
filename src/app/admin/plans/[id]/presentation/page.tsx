import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPlanPresentation, PresentationNotFoundError } from "@/lib/plan-presentations";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import PresentationEditor from "./presentation-editor";
import { PlanTabs } from "../_components/plan-tabs";

interface PageParams {
  id: string;
}

export default async function PresentationEditorPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  // Await params per Next.js 15+ pattern
  const { id: planId } = await params;

  // 1. Fetch plan from database
  const planResult = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (planResult.length === 0) {
    notFound();
  }

  const plan: Plan = planResult[0]!;

  // 2. Fetch existing presentation (optional)
  let presentation: PlanPresentation | null = null;
  try {
    presentation = await getPlanPresentation(planId);
  } catch (error) {
    if (!(error instanceof PresentationNotFoundError)) {
      throw error;
    }
    // Presentation not found is ok, leave as null
  }

  // 3. Render editor with initial data
  return (
    <div className="space-y-6">
      <PlanTabs planId={planId} activeTab="presentation" />
      <PresentationEditor
        plan={plan}
        initialPresentation={presentation}
      />
    </div>
  );
}
