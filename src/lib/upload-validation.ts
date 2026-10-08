import { z } from "zod";

// Whitelist file types by upload context
//
// F-31: SVG removed. SVG is active content (can carry inline <script>),
// and even though uploads here require admin or media:write agent key,
// allowing it means a compromised privileged credential can plant
// stored XSS via any image context (plan-cover, course-image, etc.)
// that renders the asset directly. Re-enable only with server-side
// sanitisation (DOMPurify with allow-list) AND a Content-Disposition:
// attachment header on the asset domain.
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
export const ALLOWED_PDF_TYPES = ["application/pdf"];
export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
];
export const ALLOWED_DOCUMENT_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
export const ALLOWED_ARCHIVE_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_SKILL_ARTIFACT_SIZE = 20 * 1024 * 1024; // 20 MiB compressed ZIP
export const SKILL_ARTIFACT_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
];

export const uploadContextSchema = z.enum([
  "plan-cover",
  "plan-banner",
  "course-image",
  "lesson-thumbnail",
  "lesson-content",
  "service-guide",
  "skill-artifact",
]);

export type UploadContext = z.infer<typeof uploadContextSchema>;

export interface FileValidationRules {
  maxSize: number;
  allowedTypes: string[];
  context: UploadContext;
}

export function getValidationRules(context: UploadContext): FileValidationRules {
  const rulesMap: Record<UploadContext, FileValidationRules> = {
    "plan-cover": {
      maxSize: MAX_IMAGE_SIZE,
      allowedTypes: ALLOWED_IMAGE_TYPES,
      context: "plan-cover",
    },
    "plan-banner": {
      maxSize: MAX_IMAGE_SIZE,
      allowedTypes: ALLOWED_IMAGE_TYPES,
      context: "plan-banner",
    },
    "course-image": {
      maxSize: MAX_IMAGE_SIZE,
      allowedTypes: ALLOWED_IMAGE_TYPES,
      context: "course-image",
    },
    "lesson-thumbnail": {
      maxSize: MAX_IMAGE_SIZE,
      allowedTypes: ALLOWED_IMAGE_TYPES,
      context: "lesson-thumbnail",
    },
    "lesson-content": {
      maxSize: MAX_PDF_SIZE,
      allowedTypes: [
        ...ALLOWED_PDF_TYPES,
        ...ALLOWED_IMAGE_TYPES,
        ...ALLOWED_VIDEO_TYPES,
        ...ALLOWED_AUDIO_TYPES,
        ...ALLOWED_DOCUMENT_TYPES,
        ...ALLOWED_ARCHIVE_TYPES,
      ],
      context: "lesson-content",
    },
    "service-guide": {
      maxSize: MAX_PDF_SIZE,
      allowedTypes: [...ALLOWED_PDF_TYPES, ...ALLOWED_IMAGE_TYPES],
      context: "service-guide",
    },
    "skill-artifact": {
      maxSize: MAX_SKILL_ARTIFACT_SIZE,
      allowedTypes: SKILL_ARTIFACT_TYPES,
      context: "skill-artifact",
    },
  };

  return rulesMap[context];
}

export function validateFileMetadata(
  filename: string,
  contentType: string,
  fileSize: number,
  context: UploadContext
): {
  valid: boolean;
  error?: string;
} {
  const rules = getValidationRules(context);

  // Check file type
  if (!rules.allowedTypes.includes(contentType)) {
    return {
      valid: false,
      error: `File type ${contentType} not allowed for ${context}`,
    };
  }

  const maxSize =
    context === "lesson-content" && ALLOWED_VIDEO_TYPES.includes(contentType)
      ? MAX_VIDEO_SIZE
      : rules.maxSize;

  // Check file size
  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `File size ${fileSize} exceeds maximum ${maxSize} for ${context}`,
    };
  }

  // Check filename for path traversal
  if (filename.includes("../") || filename.includes("..\\")) {
    return {
      valid: false,
      error: "Invalid filename: path traversal detected",
    };
  }

  return { valid: true };
}

export function sanitizeFilename(filename: string): string {
  // Remove path components, keep only basename
  const basename = filename.split(/[/\\]/).pop() || "file";
  // Remove special characters except . and -
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function generateStorageKey(
  context: UploadContext,
  filename: string,
  userId: string
): string {
  const sanitized = sanitizeFilename(filename);
  const timestamp = Date.now();
  const uuid = crypto.randomUUID().slice(0, 8); // first 8 chars of UUID

  return `uploads/${context}/${userId}/${timestamp}-${uuid}-${sanitized}`;
}
