ALTER TABLE "skill_releases" DROP CONSTRAINT "chk_skill_releases_published_artifact";--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "body_markdown" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "distribution_mode" text DEFAULT 'hosted' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "source_repository_url" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "source_commit_sha" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "source_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skill_releases" ADD CONSTRAINT "chk_skill_releases_published_artifact" CHECK ("skill_releases"."status" = 'draft' OR (
      ("skill_releases"."artifact_media_id" IS NULL AND "skill_releases"."checksum_sha256" IS NULL AND "skill_releases"."artifact_manifest" IS NULL AND "skill_releases"."artifact_validation" IS NULL AND "skill_releases"."artifact_validated_at" IS NULL)
      OR ("skill_releases"."artifact_media_id" IS NOT NULL AND "skill_releases"."checksum_sha256" IS NOT NULL AND "skill_releases"."artifact_manifest" IS NOT NULL AND "skill_releases"."artifact_validation" IS NOT NULL AND "skill_releases"."artifact_validated_at" IS NOT NULL)
    ));--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "chk_skills_distribution" CHECK ((
      ("skills"."distribution_mode" = 'hosted'
        AND "skills"."source_repository_url" IS NULL
        AND "skills"."source_ref" IS NULL
        AND "skills"."source_commit_sha" IS NULL
        AND "skills"."source_verified_at" IS NULL)
      OR ("skills"."distribution_mode" = 'github'
        AND "skills"."source_repository_url" IS NOT NULL
        AND "skills"."source_ref" IS NOT NULL
        AND ("skills"."source_verified_at" IS NULL OR "skills"."source_commit_sha" IS NOT NULL))
    ));--> statement-breakpoint
UPDATE "skills" AS "skill"
SET "body_markdown" = "release"."content_markdown"
FROM "skill_releases" AS "release"
WHERE "skill"."current_release_id" = "release"."id"
  AND "skill"."body_markdown" = '';--> statement-breakpoint
UPDATE "skills"
SET
  "distribution_mode" = CASE "slug"
    WHEN 'planseal' THEN 'github'
    WHEN 'baton-dispatch' THEN 'github'
    WHEN 'audience-outcome-lens' THEN 'github'
    ELSE "distribution_mode"
  END,
  "source_repository_url" = CASE "slug"
    WHEN 'planseal' THEN 'https://github.com/cablate/planseal'
    WHEN 'baton-dispatch' THEN 'https://github.com/cablate/baton'
    WHEN 'audience-outcome-lens' THEN 'https://github.com/cablate/audience-outcome-lens'
    ELSE "source_repository_url"
  END,
  "source_ref" = CASE "slug"
    WHEN 'planseal' THEN 'v0.1.0'
    WHEN 'baton-dispatch' THEN 'v0.1.1'
    WHEN 'audience-outcome-lens' THEN 'v0.1.0'
    ELSE "source_ref"
  END,
  "source_commit_sha" = CASE "slug"
    WHEN 'planseal' THEN '086e900f8ce31afa2348dc0fa69cc25ab9679755'
    WHEN 'baton-dispatch' THEN '77f12e600406065a6e62a22a66347355e278a9d7'
    WHEN 'audience-outcome-lens' THEN 'e92eda9279b6db8910c11740351f1b1e5e6fa63b'
    ELSE "source_commit_sha"
  END,
  "source_verified_at" = CASE
    WHEN "slug" IN ('planseal', 'baton-dispatch', 'audience-outcome-lens')
      THEN '2026-08-04T00:00:00+08:00'::timestamptz
    ELSE "source_verified_at"
  END
WHERE "slug" IN ('planseal', 'baton-dispatch', 'audience-outcome-lens');--> statement-breakpoint
UPDATE "skill_releases" AS "release"
SET "content_markdown" = replace(
  "release"."content_markdown",
  '需要完整 Skill artifact 時，再使用同一回應提供的下載資訊。',
  '需要安裝時，請依同一回應中的 GitHub 來源與安裝手冊取得完整內容。'
)
FROM "skills" AS "skill"
WHERE "release"."skill_id" = "skill"."id"
  AND "skill"."slug" IN ('planseal', 'baton-dispatch', 'audience-outcome-lens');--> statement-breakpoint
UPDATE "skills"
SET "body_markdown" = replace(
  "body_markdown",
  '需要完整 Skill artifact 時，再使用同一回應提供的下載資訊。',
  '需要安裝時，請依同一回應中的 GitHub 來源與安裝手冊取得完整內容。'
)
WHERE "slug" IN ('planseal', 'baton-dispatch', 'audience-outcome-lens');
