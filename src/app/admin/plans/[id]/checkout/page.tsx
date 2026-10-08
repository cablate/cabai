import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Plan } from "@/lib/db/schema";
import { CheckoutForm } from "./checkout-form";
import { PlanTabs } from "../_components/plan-tabs";

interface PageParams {
  id: string;
}

export default async function PlanCheckoutPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id: planId } = await params;

  const planResult = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (planResult.length === 0) {
    notFound();
  }

  const plan: Plan = planResult[0]!;

  return (
    <div className="space-y-6">
      <PlanTabs planId={planId} activeTab="checkout" />

      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">結帳設定</h2>
          <p className="mt-1 text-sm text-text-muted">
            控制前台購買按鈕的行為：站內結帳、外連購買，或隱藏按鈕。
          </p>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-6">
          <CheckoutForm plan={plan} />
        </div>
      </div>
    </div>
  );
}
