import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses, lessons, media, planContents, users } from "@/lib/db/schema";
import { getStorageProvider } from "@/lib/storage";
import { checkCourseAccess } from "@/lib/course-access";
import { checkPlanAccess } from "@/lib/access";
import { isPrivateMediaContext } from "@/lib/media-assets";

async function canAccessLessonAsset(
  lessonId: string,
  userId: string,
  userEmail: string | null | undefined,
  role: string | null,
): Promise<boolean> {
  if (role === "admin") return true;

  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: {
      id: true,
      courseId: true,
      isPreview: true,
      status: true,
    },
  });
  if (!lesson || lesson.status !== "published") return false;

  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, lesson.courseId), isNull(courses.deletedAt)),
    columns: { status: true },
  });
  if (course?.status !== "published") return false;
  if (lesson.isPreview) return true;

  const access = await checkCourseAccess(lesson.courseId, userId, userEmail, role ?? undefined);
  return access.hasAccess;
}

async function canAccessPlanContentAsset(
  contentId: string,
  userId: string,
  userEmail: string | null | undefined,
  role: string | null,
): Promise<boolean> {
  if (role === "admin") return true;

  const content = await db.query.planContents.findFirst({
    where: and(eq(planContents.id, contentId), isNull(planContents.deletedAt)),
    columns: { planId: true },
  });
  if (!content) return false;

  const access = await checkPlanAccess(userId, content.planId, userEmail, role ?? undefined);
  return access.hasAccess;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const record = await db.query.media.findFirst({
    where: eq(media.id, id),
  });

  if (!record || record.status === "deleted" || record.status === "orphaned") {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (!isPrivateMediaContext(record.context)) {
    return NextResponse.redirect(record.publicUrl);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { role: true, email: true },
  });
  const role = dbUser?.role ?? null;
  const email = dbUser?.email ?? session.user.email;

  let allowed = false;

  if (record.status === "pending") {
    allowed = role === "admin" || record.uploadedBy === session.user.id;
  } else if (record.entityType === "lesson" && record.entityId) {
    allowed = await canAccessLessonAsset(record.entityId, session.user.id, email, role);
  } else if (record.entityType === "planContent" && record.entityId) {
    allowed = await canAccessPlanContentAsset(record.entityId, session.user.id, email, role);
  } else {
    allowed = role === "admin" || record.uploadedBy === session.user.id;
  }

  if (!allowed) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const signedUrl = await getStorageProvider().createDownloadTarget(record.storageKey, 300);
  const response = NextResponse.redirect(signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
