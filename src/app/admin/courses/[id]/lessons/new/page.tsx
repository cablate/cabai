import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { chapters, courses, lessons } from "@/lib/db/schema";
import { eq, asc, and, isNull, count } from "drizzle-orm";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { CreateLessonClient } from "./create-lesson-client";

export default async function NewLessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = await params;

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) notFound();

  const allChapters = await db
    .select({ id: chapters.id, title: chapters.title })
    .from(chapters)
    .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)))
    .orderBy(asc(chapters.sortOrder));

  if (allChapters.length === 0) notFound();

  const [lessonCount] = await db
    .select({ value: count() })
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)));

  return (
    <div className="space-y-6">
      <div>
        <Link prefetch={false}
          href={`/admin/courses/${courseId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success"
        >
          <ArrowLeft size={16} weight="bold" />
          返回 {course.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
          新增課堂
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {course.title}
        </p>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface p-8">
        <CreateLessonClient
          courseId={courseId}
          chapters={allChapters}
          nextSortOrder={lessonCount?.value ?? 0}
        />
      </div>
    </div>
  );
}
