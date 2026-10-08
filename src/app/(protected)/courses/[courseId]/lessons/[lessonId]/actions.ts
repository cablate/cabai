"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, userProgress, lessons, courses } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { checkCourseAccess } from "@/lib/course-access";
import { recordEvent } from "@/lib/event-tracking";

export type ToggleLessonResult = {
  completed: boolean;
  error?: string;
};

export async function toggleLessonComplete(
  lessonId: string,
  completed: boolean,
): Promise<ToggleLessonResult> {
  const session = await auth();
  if (!session?.user?.id) return { completed: false, error: "請先登入" };

  const lesson = await db.query.lessons.findFirst({
    where: and(
      eq(lessons.id, lessonId),
      eq(lessons.status, "published"),
      isNull(lessons.deletedAt),
    ),
  });
  if (!lesson) return { completed: false, error: "找不到這堂課" };

  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, lesson.courseId), isNull(courses.deletedAt)),
  });
  if (!course) return { completed: false, error: "找不到課程" };

  if (!lesson.isPreview) {
    const access = await checkCourseAccess(
      course.id,
      session.user.id,
      session.user.email,
      session.user.role,
    );
    if (!access.hasAccess) {
      return { completed: false, error: "你沒有這門課的存取權限" };
    }
  }

  const existing = await db.query.userProgress.findFirst({
    where: and(
      eq(userProgress.userId, session.user.id),
      eq(userProgress.lessonId, lessonId),
    ),
  });

  if (existing) {
    // Once completed, cannot unmark
    if (existing.completed && !completed) {
      return { completed: true };
    }

    await db
      .update(userProgress)
      .set({
        completed,
        progress: completed ? 100 : existing.progress,
        lastAccessedAt: new Date(),
      })
      .where(eq(userProgress.id, existing.id));
  } else {
    await db
      .insert(userProgress)
      .values({
        userId: session.user.id,
        lessonId,
        completed,
        progress: completed ? 100 : 0,
      })
      .onConflictDoNothing();
  }

  // Await the write so the server action cannot finish while a DB operation
  // still references data that a following request or test may clean up.
  if (completed) {
    await recordEvent({
      userId: session.user.id,
      eventType: "lesson_completed",
      properties: { lessonId, courseId: lesson.courseId },
      source: "server",
    }).catch(() => undefined);
  }

  // Revalidate the course page so chapter progress updates on navigation back
  if (lesson.courseId) {
    revalidatePath(`/courses/${lesson.courseId}`);
  }

  return { completed };
}

export async function updateAutoMarkPreference(
  autoMark: boolean,
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "請先登入" };

  await db
    .update(users)
    .set({ autoMarkComplete: autoMark, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  revalidatePath("/courses", "layout");
  return { success: true };
}
