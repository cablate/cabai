export const COURSE_EXPORT_SCHEMA = "course-export/v1" as const;

export type PublicationIntent = "draft" | "published" | "archived";
export type LessonType = "video" | "text" | "pdf" | "download";
export type ResourceType = "video" | "pdf" | "download" | "link";

export interface CourseExportAsset {
  logicalId: string;
  path: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  visibility: "public" | "private";
}

export interface CourseExportResource {
  logicalId: string;
  type: ResourceType;
  title: string;
  order: number;
  url?: string;
  assetLogicalId?: string;
}

export interface CourseExportLesson {
  logicalId: string;
  chapterLogicalId: string;
  title: string;
  type: LessonType;
  content: string;
  duration: number | null;
  order: number;
  isPreview: boolean;
  publicationIntent: "draft" | "published";
  assetLogicalIds: string[];
  resources: CourseExportResource[];
}

export interface CourseExportChapter {
  logicalId: string;
  title: string;
  order: number;
  defaultExpanded: boolean;
  lessons: CourseExportLesson[];
}

export interface CourseExportV1 {
  schema: typeof COURSE_EXPORT_SCHEMA;
  exportedAt: string;
  sourceIdentity: "database-id";
  course: {
    logicalId: string;
    title: string;
    description: string | null;
    order: number;
    publicationIntent: PublicationIntent;
    imageAssetLogicalId?: string;
    chapters: CourseExportChapter[];
  };
  assets: CourseExportAsset[];
}

export type CourseExportInput = Omit<CourseExportV1, "schema" | "sourceIdentity">;

export type ImportEntityKind = "course" | "chapter" | "lesson" | "asset";
export type ImportAction = "create" | "update" | "conflict" | "skip";

export interface ExistingImportEntity {
  kind: ImportEntityKind;
  logicalId: string;
  fingerprint?: string;
}

export interface CourseImportPlanItem {
  kind: ImportEntityKind;
  logicalId: string;
  action: ImportAction;
  fingerprint: string;
}

export interface CourseImportPlan {
  schema: typeof COURSE_EXPORT_SCHEMA;
  manifestFingerprint: string;
  items: CourseImportPlanItem[];
  counts: Record<ImportAction, number>;
  manifest: CourseExportV1;
}

export interface CourseImportWriter {
  apply(item: CourseImportPlanItem, manifest: CourseExportV1): Promise<void>;
}

export interface CourseImportRepository {
  transaction<T>(work: (writer: CourseImportWriter) => Promise<T>): Promise<T>;
}

export interface CourseImportBudgets {
  maxDocumentBytes: number;
  maxAssetBytes: number;
  maxTotalAssetBytes: number;
  maxEntities: number;
}
