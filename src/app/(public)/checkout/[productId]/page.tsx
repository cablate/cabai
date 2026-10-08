import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PORTALY_MODE } from "@/lib/portaly";
import { resolvePlanByIdOrSlug } from "@/lib/plans-local";
import { getDeliveryOverviewForPlan } from "@/lib/delivery";
import { getPlanWithPresentation, isPublicPlanPresentation } from "@/lib/plan-presentations";
import { CheckoutOfferingSummary } from "@/components/checkout/checkout-offering-summary";
import { CheckoutDeliveryExpectation } from "@/components/checkout/checkout-delivery-expectation";
import { CheckoutPaymentSummary } from "@/components/checkout/checkout-payment-summary";
import { checkPlanAccess } from "@/lib/access";
import { planPath } from "@/lib/plan-url";
import { getPublishedCourseStatsForPlan } from "@/lib/queries/course-catalog";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "結帳",
  robots: { index: false, follow: false },
};

interface CheckoutPageProps {
  params: Promise<{ productId: string }>;
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { productId: idOrSlug } = await params;

  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=/checkout/${idOrSlug}`);
  }

  const plan = await resolvePlanByIdOrSlug(idOrSlug);
  if (!plan || plan.status !== "active") {
    notFound();
  }
  const planId = plan.id;

  // Checkout guard: external plans redirect out; disabled plans block
  if (plan.purchaseButtonMode === "external") {
    const externalUrl = plan.externalCheckoutUrl;
    if (externalUrl) {
      try {
        new URL(externalUrl);
        redirect(externalUrl);
      } catch {
        // Invalid URL — fall through to show error below
      }
    }
  }

  // Already purchased (or admin)? Redirect to delivery page
  const access = await checkPlanAccess(
    session.user.id!,
    planId,
    session.user.email,
    session.user.role,
  );
  if (access.hasAccess) {
    redirect(planPath(plan, "my"));
  }

  // Free-claim plans live on the products page — no checkout flow here.
  if (plan.purchaseButtonMode === "free_claim") {
    redirect(planPath(plan, "product"));
  }

  // Fetch presentation for type-aware rendering
  let presentation = null;
  try {
    const result = await getPlanWithPresentation(planId);
    presentation = result.presentation;
  } catch {
    // Presentation is optional, continue without it
  }

  if (!isPublicPlanPresentation(plan, presentation)) notFound();

  const delivery = await getDeliveryOverviewForPlan(planId);
  const courseStats =
    presentation?.offeringType === "course"
      ? await getPublishedCourseStatsForPlan(planId)
      : null;

  return (
    <main className="min-h-screen bg-surface-hover px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:pb-24">
      <div className="mx-auto w-full max-w-6xl">
        <Link prefetch={false}
          href={planPath(plan, "product")}
          className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-sm text-sm font-medium text-text-muted transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← 返回商品頁
        </Link>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
          <div className="space-y-6">
            <header className="max-w-2xl pb-2">
              <p className="text-xs font-medium text-text-muted">付款前確認</p>
              <h1 className="mt-2 font-display text-3xl font-medium tracking-[-0.035em] text-text-primary [text-wrap:balance] sm:text-4xl">
                確認購買內容
              </h1>
              <p className="mt-3 text-sm leading-6 text-text-secondary [text-wrap:pretty] sm:text-base">
                先核對 CabAI 商品、交付內容、付款帳號與金額；確認後才會離開本站前往 Portaly。
              </p>
            </header>

            <section aria-labelledby="checkout-product-heading" className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-sm">
              <div className="border-b border-border-subtle px-5 py-4 sm:px-6">
                <p className="text-xs font-medium text-text-muted">你正在購買</p>
                <h2 id="checkout-product-heading" className="sr-only">
                  {presentation?.title || plan.name}
                </h2>
              </div>

              {(presentation?.coverImage || plan.image) && (
                <div className="relative aspect-[16/7] overflow-hidden bg-surface-muted sm:aspect-[16/6]">
                  <Image
                    src={presentation?.coverImage || plan.image || ""}
                    alt={presentation?.title || plan.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 720px"
                    priority
                  />
                </div>
              )}

              <div className="p-5 sm:p-6">
                {presentation ? (
                  <CheckoutOfferingSummary
                    presentation={presentation}
                    plan={plan}
                    courseStats={courseStats}
                  />
                ) : (
                  <div>
                    <h3 className="text-xl font-semibold text-text-primary [text-wrap:balance]">{plan.name}</h3>
                    {plan.description ? (
                      <p className="mt-2 text-sm leading-6 text-text-secondary [text-wrap:pretty]">{plan.description}</p>
                    ) : null}
                  </div>
                )}
              </div>
            </section>

            <CheckoutDeliveryExpectation presentation={presentation} delivery={delivery} />
          </div>

          <CheckoutPaymentSummary
            plan={plan}
            productName={presentation?.title || plan.name}
            buyer={{ name: session.user.name, email: session.user.email, image: session.user.image }}
            providerMode={PORTALY_MODE}
          />
        </div>
      </div>
    </main>
  );
}
