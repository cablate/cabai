import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { db, dbPool } from "../src/lib/db";
import {
  chapters,
  courses,
  lessons,
  planCourses,
  planPresentations,
  plans,
} from "../src/lib/db/schema";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/demo-course",
);
const MANIFEST_PATH = path.join(FIXTURE_ROOT, "manifest.json");

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  license: z.object({
    spdx: z.string().min(1),
    url: z.string().url(),
    notice: z.string().min(1),
  }),
  plan: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
    billingPeriod: z.literal("one-time"),
    pricingType: z.literal("fixed"),
    status: z.literal("active"),
    gateway: z.literal("manual"),
    purchaseButtonMode: z.literal("free_claim"),
    hasPlatformContent: z.literal(true),
    hasExternalService: z.literal(false),
  }),
  presentation: z.object({
    id: z.string().uuid(),
    offeringType: z.literal("course"),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    description: z.string().min(1),
    ctaLabel: z.string().min(1),
    metadataJson: z.record(z.string(), z.unknown()),
    trustNotesJson: z.array(z.record(z.string(), z.unknown())),
    publishedAt: z.string().datetime(),
  }),
  course: z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().min(1),
    status: z.literal("published"),
    sortOrder: z.number().int(),
  }),
  chapters: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    sortOrder: z.number().int(),
    defaultExpanded: z.boolean(),
    lessons: z.array(z.object({
      id: z.string().uuid(),
      title: z.string().min(1),
      contentPath: z.string().min(1),
      type: z.enum(["video", "text", "pdf", "download"]),
      sortOrder: z.number().int(),
      isPreview: z.boolean(),
      status: z.literal("published"),
      duration: z.number().int().positive().nullable().optional(),
    })),
  })),
});

export type DemoManifest = z.infer<typeof manifestSchema>;

export const DEMO_IDS = {
  planId: "00000000-0000-4000-8000-000000000001",
  presentationId: "00000000-0000-4000-8000-000000000010",
  courseId: "00000000-0000-4000-8000-000000000100",
} as const;

export async function readDemoManifest(): Promise<DemoManifest> {
  const raw = await fs.readFile(MANIFEST_PATH, "utf8");
  return manifestSchema.parse(JSON.parse(raw));
}

function resolveFixturePath(relativePath: string): string {
  const root = `${FIXTURE_ROOT}${path.sep}`;
  const resolved = path.resolve(FIXTURE_ROOT, relativePath);
  if (!resolved.startsWith(root)) {
    throw new Error(`Demo fixture path escapes fixture root: ${relativePath}`);
  }
  return resolved;
}

function isLoopbackHost(hostname: string): boolean {
  return new Set(["localhost", "127.0.0.1", "::1", "postgres"]).has(
    hostname.toLowerCase(),
  );
}

/**
 * Refuse obvious production/remote targets unless the operator opts in.
 * The seed is intentionally safe-by-default because it upserts published data.
 */
export function assertSafeDatabaseTarget(
  databaseUrl = process.env.DATABASE_URL,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (!databaseUrl?.trim()) {
    throw new Error("DATABASE_URL is required before running the demo seed.");
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("Refusing to seed while NODE_ENV=production.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Demo seed requires a PostgreSQL DATABASE_URL.");
  }
  if (
    !isLoopbackHost(parsed.hostname) &&
    environment.SEED_DEMO_ALLOW_REMOTE !== "1"
  ) {
    throw new Error(
      `Refusing remote database host '${parsed.hostname}'. Set SEED_DEMO_ALLOW_REMOTE=1 only when this target is intentional.`,
    );
  }
}

export interface DemoSeedResult {
  planId: string;
  courseId: string;
  chapterCount: number;
  lessonCount: number;
  freeClaimEnabled: true;
}

export async function seedDemo(): Promise<DemoSeedResult> {
  const manifest = await readDemoManifest();
  const lessonsWithContent = await Promise.all(
    manifest.chapters.flatMap((chapter) =>
      chapter.lessons.map(async (lesson) => ({
        chapter,
        lesson,
        content: await fs.readFile(resolveFixturePath(lesson.contentPath), "utf8"),
      })),
    ),
  );

  await db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .insert(plans)
      .values({
        id: manifest.plan.id,
        providerPlanId: null,
        slug: manifest.plan.slug,
        name: manifest.plan.name,
        description: manifest.plan.description,
        amount: manifest.plan.amount,
        currency: manifest.plan.currency,
        billingPeriod: manifest.plan.billingPeriod,
        pricingType: manifest.plan.pricingType,
        status: manifest.plan.status,
        image: null,
        merchantPlanId: null,
        hasPlatformContent: manifest.plan.hasPlatformContent,
        hasExternalService: manifest.plan.hasExternalService,
        gateway: manifest.plan.gateway,
        purchaseButtonMode: manifest.plan.purchaseButtonMode,
        externalCheckoutUrl: null,
        externalCheckoutLabel: null,
        externalCheckoutNewTab: true,
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          providerPlanId: null,
          slug: manifest.plan.slug,
          name: manifest.plan.name,
          description: manifest.plan.description,
          amount: manifest.plan.amount,
          currency: manifest.plan.currency,
          billingPeriod: manifest.plan.billingPeriod,
          pricingType: manifest.plan.pricingType,
          status: manifest.plan.status,
          image: null,
          merchantPlanId: null,
          hasPlatformContent: manifest.plan.hasPlatformContent,
          hasExternalService: manifest.plan.hasExternalService,
          gateway: manifest.plan.gateway,
          purchaseButtonMode: manifest.plan.purchaseButtonMode,
          externalCheckoutUrl: null,
          externalCheckoutLabel: null,
          externalCheckoutNewTab: true,
          syncedAt: now,
        },
      });

    await tx
      .insert(courses)
      .values({
        id: manifest.course.id,
        title: manifest.course.title,
        description: manifest.course.description,
        image: null,
        sortOrder: manifest.course.sortOrder,
        status: manifest.course.status,
      })
      .onConflictDoUpdate({
        target: courses.id,
        set: {
          title: manifest.course.title,
          description: manifest.course.description,
          image: null,
          sortOrder: manifest.course.sortOrder,
          status: manifest.course.status,
          deletedAt: null,
          deletedBy: null,
          updatedAt: now,
        },
      });

    await tx
      .insert(planPresentations)
      .values({
        id: manifest.presentation.id,
        planId: manifest.plan.id,
        offeringType: manifest.presentation.offeringType,
        title: manifest.presentation.title,
        subtitle: manifest.presentation.subtitle,
        description: manifest.presentation.description,
        coverImage: null,
        bannerImage: null,
        ctaLabel: manifest.presentation.ctaLabel,
        metadataJson: manifest.presentation.metadataJson,
        trustNotesJson: manifest.presentation.trustNotesJson,
        isFeatured: false,
        featuredSortOrder: null,
        publishedAt: new Date(manifest.presentation.publishedAt),
      })
      .onConflictDoUpdate({
        target: planPresentations.planId,
        set: {
          offeringType: manifest.presentation.offeringType,
          title: manifest.presentation.title,
          subtitle: manifest.presentation.subtitle,
          description: manifest.presentation.description,
          coverImage: null,
          bannerImage: null,
          ctaLabel: manifest.presentation.ctaLabel,
          metadataJson: manifest.presentation.metadataJson,
          trustNotesJson: manifest.presentation.trustNotesJson,
          isFeatured: false,
          featuredSortOrder: null,
          publishedAt: new Date(manifest.presentation.publishedAt),
          deletedAt: null,
          deletedBy: null,
          updatedAt: now,
        },
      });

    for (const chapter of manifest.chapters) {
      await tx
        .insert(chapters)
        .values({
          id: chapter.id,
          courseId: manifest.course.id,
          title: chapter.title,
          sortOrder: chapter.sortOrder,
          defaultExpanded: chapter.defaultExpanded,
        })
        .onConflictDoUpdate({
          target: chapters.id,
          set: {
            courseId: manifest.course.id,
            title: chapter.title,
            sortOrder: chapter.sortOrder,
            defaultExpanded: chapter.defaultExpanded,
            deletedAt: null,
            deletedBy: null,
            updatedAt: now,
          },
        });
    }

    for (const { chapter, lesson, content } of lessonsWithContent) {
      await tx
        .insert(lessons)
        .values({
          id: lesson.id,
          courseId: manifest.course.id,
          chapterId: chapter.id,
          title: lesson.title,
          type: lesson.type,
          content,
          resourcesJson: [],
          duration: lesson.duration ?? null,
          sortOrder: lesson.sortOrder,
          isPreview: lesson.isPreview,
          status: lesson.status,
        })
        .onConflictDoUpdate({
          target: lessons.id,
          set: {
            courseId: manifest.course.id,
            chapterId: chapter.id,
            title: lesson.title,
            type: lesson.type,
            content,
            resourcesJson: [],
            duration: lesson.duration ?? null,
            sortOrder: lesson.sortOrder,
            isPreview: lesson.isPreview,
            status: lesson.status,
            deletedAt: null,
            deletedBy: null,
            updatedAt: now,
          },
        });
    }

    await tx
      .insert(planCourses)
      .values({
        id: "00000000-0000-4000-8000-000000000401",
        planId: manifest.plan.id,
        courseId: manifest.course.id,
        removedAt: null,
      })
      .onConflictDoUpdate({
        target: [planCourses.planId, planCourses.courseId],
        set: { removedAt: null },
      });
  });

  return {
    planId: manifest.plan.id,
    courseId: manifest.course.id,
    chapterCount: manifest.chapters.length,
    lessonCount: lessonsWithContent.length,
    freeClaimEnabled: true,
  };
}

async function main(): Promise<void> {
  try {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      console.log("Usage: npm run script:seed-demo");
      console.log("Set SEED_DEMO_ALLOW_REMOTE=1 only for an intentional remote development database.");
      return;
    }
    assertSafeDatabaseTarget();
    const result = await seedDemo();
    console.log(
      `[demo-seed] ready: plan=${result.planId} course=${result.courseId} chapters=${result.chapterCount} lessons=${result.lessonCount} free_claim=enabled`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[demo-seed] failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await dbPool.end();
  }
}

const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  void main();
}
