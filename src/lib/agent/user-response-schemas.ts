import { z } from "zod";

const dateTimeSchema = z.string().datetime({ offset: true });
const nullableDateTimeSchema = dateTimeSchema.nullable();

export const libraryPublicSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  featured: z.boolean(),
  revision: z.number().int(),
  publishedAt: nullableDateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict().openapi("LibraryPublicSummary");

export const libraryPublicDetailSchema = libraryPublicSummarySchema.extend({
  bodyMarkdown: z.string(),
}).strict().openapi("LibraryPublicDetail");

export const publicSkillReleaseSummarySchema = z.object({
  id: z.string(),
  skillId: z.string(),
  version: z.string(),
  checksumSha256: z.string(),
  compatibility: z.string(),
  license: z.string(),
  accessPolicy: z.enum(["public", "authenticated"]),
  status: z.enum(["published", "deprecated"]),
  publishedAt: dateTimeSchema,
  deprecatedAt: nullableDateTimeSchema,
  downloadRequiresAuthentication: z.boolean(),
  downloadableForViewer: z.boolean(),
}).strict().openapi("PublicSkillReleaseSummary");

export const publicSkillReleaseDetailSchema = publicSkillReleaseSummarySchema.extend({
  contentMarkdown: z.string(),
  changelogMarkdown: z.string(),
}).strict().openapi("PublicSkillReleaseDetail");

export const publicSkillSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  publishedAt: dateTimeSchema,
  currentRelease: publicSkillReleaseSummarySchema,
}).strict().openapi("PublicSkillSummary");

export const publicSkillDetailSchema = publicSkillSummarySchema.extend({
  currentRelease: publicSkillReleaseDetailSchema,
  releases: z.array(publicSkillReleaseDetailSchema),
}).strict().openapi("PublicSkillDetail");

export const userCourseSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  image: z.string().nullable(),
  updatedAt: dateTimeSchema,
}).strict().openapi("UserCourseSummary");

export const informationActionResponseSchema = z.object({
  rel: z.string(),
  operationId: z.string(),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean()])),
  credential: z.enum(["none", "user"]),
}).strict().openapi("InformationAction");

export const userInformationSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  summary: z.string(),
  whyItMatters: z.string(),
  publishedAt: dateTimeSchema,
  expiresAt: nullableDateTimeSchema,
  tags: z.array(z.string()),
}).strict().openapi("UserInformationSummary");

export const userInformationDetailSchema = userInformationSummarySchema.extend({
  bodyMarkdown: z.string(),
  actions: z.array(informationActionResponseSchema),
}).strict().openapi("UserInformationDetail");

export const userInformationFeedSchema = z.object({
  items: z.array(z.union([userInformationSummarySchema, userInformationDetailSchema])),
  nextCursor: z.string().nullable(),
}).strict().openapi("UserInformationFeed");

export const userInformationAckResponseSchema = z.object({
  acknowledged: z.array(z.string()),
}).strict().openapi("UserInformationAckResponse");

export const courseOutlineContentSchema = z.object({
  course: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.string(),
    updatedAt: dateTimeSchema,
  }).strict(),
  purchase: z.object({
    orderId: z.string().nullable(),
    purchasedAt: nullableDateTimeSchema,
    entitlement: z.string(),
  }).strict(),
  content: z.object({
    format: z.literal("markdown"),
    language: z.string(),
    chapters: z.array(z.object({
      id: z.string(),
      title: z.string(),
      sortOrder: z.number().int(),
      lessons: z.array(z.object({
        id: z.string(),
        title: z.string(),
        type: z.string(),
        duration: z.number().nullable(),
        sortOrder: z.number().int(),
      }).strict()),
    }).strict()),
    supplementary: z.object({
      resources: z.array(z.unknown()),
      extractedSkills: z.array(z.unknown()),
    }).strict(),
  }).strict(),
}).strict().openapi("UserCourseOutlineContent");

export const courseLessonContentSchema = z.object({
  course: z.object({ id: z.string(), title: z.string() }).strict(),
  chapter: z.object({ id: z.string(), title: z.string() }).strict().nullable(),
  lesson: z.object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    content: z.unknown(),
    resources: z.unknown(),
    duration: z.number().nullable(),
    sortOrder: z.number().int(),
  }).strict(),
}).strict().openapi("UserCourseLessonContent");

export const userCourseContentSchema = z.union([
  courseOutlineContentSchema,
  courseLessonContentSchema,
]).openapi("UserCourseContent");
