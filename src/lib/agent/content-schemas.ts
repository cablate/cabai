import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const courseCreateSchema = z.object({
  planId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
}).openapi("CourseCreateInput");

export const courseUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
}).openapi("CourseUpdateInput");

export const entityDeleteSchema = z.object({ id: z.string().min(1) }).openapi("EntityDeleteInput");

export const chapterCreateSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1),
  sortOrder: z.number().int().optional(),
}).openapi("ChapterCreateInput");

export const chapterUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  defaultExpanded: z.boolean().optional(),
}).openapi("ChapterUpdateInput");

export const lessonResourceSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(["video", "pdf", "download", "link"]),
  title: z.string().min(1),
  url: z.string().min(1),
  sortOrder: z.number().int().optional(),
}).openapi("LessonResourceInput");

export const lessonCreateSchema = z.object({
  courseId: z.string().min(1),
  chapterId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["video", "text", "pdf", "download"]),
  content: z.string().min(1),
  resourcesJson: z.array(lessonResourceSchema).optional(),
  duration: z.number().int().positive().optional().nullable(),
  isPreview: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).openapi("LessonCreateInput");

export const lessonUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  type: z.enum(["video", "text", "pdf", "download"]).optional(),
  content: z.string().min(1).optional(),
  resourcesJson: z.array(lessonResourceSchema).optional(),
  chapterId: z.string().min(1).optional(),
  duration: z.number().int().positive().optional().nullable(),
  isPreview: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(["draft", "published"]).optional(),
}).openapi("LessonUpdateInput");

export const courseIdSchema = z.object({ courseId: z.string().min(1) }).openapi("CourseIdInput");

export const courseInformationPublishSchema = z.object({
  courseId: z.string().min(1),
  sourceVersion: z.string().min(1),
  informationId: z.string().min(1),
  expectedInformationRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).max(200),
}).strict().openapi("CourseInformationPublishInput");
