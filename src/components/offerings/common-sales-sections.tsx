import { type ReactNode } from "react";
import {
  CaretDown,
  CheckCircle,
  Flag,
  Package,
  Prohibit,
  Question,
  Target,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import TestimonialCarousel, { type TestimonialItem } from "./testimonial-carousel";

interface FaqItem {
  q: string;
  a: string;
}

interface Instructor {
  name?: string;
  bio?: string;
  credentials?: string[];
}

interface CommonSalesSectionsProps {
  metadata: Record<string, unknown> | null;
  phase?: "all" | "fit" | "value" | "proof";
}

function stringList(metadata: Record<string, unknown>, key: string): string[] {
  if (!Array.isArray(metadata[key])) return [];
  return (metadata[key] as string[])
    .map((item) => item.trim())
    .filter(Boolean);
}

function faqList(metadata: Record<string, unknown>): FaqItem[] {
  if (!Array.isArray(metadata.faqItems)) return [];
  return (metadata.faqItems as FaqItem[]).filter(
    (item) => item.q?.trim() && item.a?.trim()
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      {eyebrow && (
        <p className="mb-2 font-mono text-xs uppercase text-text-muted">
          {eyebrow}
        </p>
      )}
      <h2 className="mb-4 text-2xl font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function IconListSection({
  id,
  eyebrow,
  title,
  items,
  icon: Icon,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  items: string[];
  icon: typeof CheckCircle;
}) {
  if (items.length === 0) return null;

  return (
    <SectionShell id={id} eyebrow={eyebrow} title={title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <Icon
              size={20}
              weight="duotone"
              className="mt-0.5 shrink-0 text-accent"
            />
            <p className="text-sm leading-6 text-text-secondary">{item}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function PainPointsSection({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <SectionShell id="problems" eyebrow="BEFORE" title="你是不是也卡在這裡？">
      <div className="space-y-3 rounded-lg border border-border-subtle bg-surface p-5">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="flex gap-3">
            <WarningCircle
              size={20}
              weight="duotone"
              className="mt-0.5 shrink-0 text-amber-600"
            />
            <p className="text-sm leading-6 text-text-secondary">{item}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function InstructorCard({ instructor }: { instructor: Instructor }) {
  if (!instructor.name && !instructor.bio) return null;

  return (
    <SectionShell id="author" eyebrow="AUTHOR" title="關於作者">
      <div className="rounded-lg border border-border-subtle bg-surface p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-muted">
            <UserCircle size={36} weight="duotone" className="text-text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            {instructor.name && (
              <p className="text-lg font-semibold text-text-primary">
                {instructor.name}
              </p>
            )}
            {instructor.bio && (
              <p className="mt-2 text-sm leading-7 text-text-secondary">
                {instructor.bio}
              </p>
            )}
            {instructor.credentials && instructor.credentials.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {instructor.credentials
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .map((credential, index) => (
                    <span
                      key={`${credential}-${index}`}
                      className="rounded-full border border-border-subtle bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary"
                    >
                      {credential}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function FaqRow({ item, defaultOpen }: { item: FaqItem; defaultOpen: boolean }) {
  return (
    <details
      open={defaultOpen}
      className="group border-b border-border-subtle last:border-b-0 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex w-full cursor-pointer list-none items-center gap-3 px-5 py-4 text-left transition-[background-color,transform] hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:scale-[0.995]">
        <Question
          size={18}
          weight="duotone"
          className="shrink-0 text-text-muted"
        />
        <span className="flex-1 text-sm font-medium text-text-primary">
          {item.q}
        </span>
        <CaretDown
          size={14}
          weight="bold"
          className="shrink-0 -rotate-90 text-text-muted transition-transform duration-200 group-open:rotate-0"
        />
      </summary>
      <div className="px-5 pb-5 pl-12">
        <p className="text-sm leading-7 text-text-secondary">{item.a}</p>
      </div>
    </details>
  );
}

function FaqSection({ items }: { items: FaqItem[] }) {
  if (items.length === 0) return null;

  return (
    <SectionShell id="faq" eyebrow="FAQ" title="購買前常見問題">
      <div
        className="overflow-hidden rounded-lg border border-border-subtle bg-surface"
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 600px" }}
      >
        {items.map((item, index) => (
          <FaqRow key={`${item.q}-${index}`} item={item} defaultOpen={index === 0} />
        ))}
      </div>
    </SectionShell>
  );
}

function TestimonialsSection({ items }: { items: TestimonialItem[] }) {
  if (items.length === 0) return null;

  return (
    <SectionShell id="testimonials" eyebrow="TESTIMONIALS" title="學員評價">
      <TestimonialCarousel items={items} />
    </SectionShell>
  );
}

/**
 * Horizontal scroll-snap carousel with arrow navigation.
 * Client-side interactivity isolated here so parent can stay server-side.
 */

// ─── "不適合誰" section ───

function NotForSection({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <SectionShell id="not-for" eyebrow="NOT FOR" title="這可能不適合你">
      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-5">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="flex gap-3">
            <Prohibit
              size={20}
              weight="duotone"
              className="mt-0.5 shrink-0 text-amber-500"
            />
            <p className="text-sm leading-6 text-amber-900">{item}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ─── "7 天怎麼開始" section ───

function FirstWeekPlanSection({ plan }: { plan: string | null }) {
  if (!plan) return null;

  return (
    <SectionShell
      id="first-week"
      eyebrow="FIRST 7 DAYS"
      title="買完後怎麼開始"
    >
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6">
        <div className="prose prose-sm max-w-none text-emerald-900 prose-p:leading-7">
          {plan.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

// ─── "跟免費內容差異" section ───

function VsFreeContentSection({ content }: { content: string | null }) {
  if (!content) return null;

  return (
    <SectionShell
      id="vs-free"
      eyebrow="VS FREE"
      title="跟免費資源差在哪"
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-6">
        <div className="prose prose-sm max-w-none text-blue-900 prose-p:leading-7">
          {content.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

export function CommonSalesSections({
  metadata,
  phase = "all",
}: CommonSalesSectionsProps) {
  if (!metadata) return null;

  const audienceItems = stringList(metadata, "audienceItems");
  const painPoints = stringList(metadata, "painPoints");
  const notForItems = stringList(metadata, "notForItems");
  const learningObjectives = stringList(metadata, "learningObjectives");
  const includedItems = stringList(metadata, "includedItems");
  const outcomes = stringList(metadata, "outcomes");
  const prerequisites = stringList(metadata, "prerequisites");
  const firstWeekPlan =
    typeof metadata.firstWeekPlan === "string" ? metadata.firstWeekPlan : null;
  const vsFreeContent =
    typeof metadata.vsFreeContent === "string" ? metadata.vsFreeContent : null;
  const faqItems = faqList(metadata);
  const testimonials = (metadata.testimonials as TestimonialItem[]) || [];
  const instructor = metadata.instructor as Instructor | undefined;

  const hasFit =
    audienceItems.length > 0 ||
    painPoints.length > 0 ||
    notForItems.length > 0;
  const hasValue =
    learningObjectives.length > 0 ||
    includedItems.length > 0 ||
    outcomes.length > 0 ||
    prerequisites.length > 0 ||
    firstWeekPlan !== null ||
    vsFreeContent !== null;
  const hasProof =
    Boolean(instructor?.name || instructor?.bio) ||
    faqItems.length > 0 ||
    testimonials.length > 0;
  const hasAny =
    phase === "fit"
      ? hasFit
      : phase === "value"
        ? hasValue
        : phase === "proof"
          ? hasProof
          : hasFit || hasValue || hasProof;

  if (!hasAny) return null;

  const showFit = phase === "all" || phase === "fit";
  const showValue = phase === "all" || phase === "value";
  const showProof = phase === "all" || phase === "proof";

  return (
    <div className="space-y-12">
      {showFit ? (
        <>
          <IconListSection
            id="audience"
            eyebrow="FIT"
            title="這適合誰"
            items={audienceItems}
            icon={Target}
          />
          <PainPointsSection items={painPoints} />
          <NotForSection items={notForItems} />
        </>
      ) : null}
      {showValue ? (
        <>
          <IconListSection
            id="learn"
            eyebrow="LEARN"
            title="你會學到"
            items={learningObjectives}
            icon={CheckCircle}
          />
          <IconListSection
            id="included"
            eyebrow="INCLUDED"
            title="包含內容"
            items={includedItems}
            icon={Package}
          />
          <IconListSection
            id="outcomes"
            eyebrow="OUTCOME"
            title="完成後你可以"
            items={outcomes}
            icon={Flag}
          />
          <IconListSection
            id="prerequisites"
            eyebrow="START"
            title="開始前你需要"
            items={prerequisites}
            icon={CheckCircle}
          />
          <FirstWeekPlanSection plan={firstWeekPlan} />
          <VsFreeContentSection content={vsFreeContent} />
        </>
      ) : null}
      {showProof ? (
        <>
          {instructor && <InstructorCard instructor={instructor} />}
          <TestimonialsSection items={testimonials} />
          <FaqSection items={faqItems} />
        </>
      ) : null}
    </div>
  );
}
