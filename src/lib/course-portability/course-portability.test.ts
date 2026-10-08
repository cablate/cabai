import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCourseImportPlan,
  buildCourseExport,
  parseCourseExport,
  planCourseImport,
  serializeCourseExport,
  type CourseExportInput,
  type CourseImportRepository,
} from "./index";

const checksum = "a".repeat(64);

function source(): CourseExportInput {
  return {
    exportedAt: "2026-07-13T00:00:00.000Z",
    course: {
      logicalId: "course-1",
      title: "Portable course",
      description: "Neutral fixture",
      order: 0,
      publicationIntent: "published",
      imageAssetLogicalId: "asset-cover",
      chapters: [
        {
          logicalId: "chapter-2",
          title: "Second",
          order: 2,
          defaultExpanded: false,
          lessons: [],
        },
        {
          logicalId: "chapter-1",
          title: "First",
          order: 1,
          defaultExpanded: true,
          lessons: [
            {
              logicalId: "lesson-1",
              chapterLogicalId: "chapter-1",
              title: "Welcome",
              type: "text",
              content: "Hello",
              duration: null,
              order: 0,
              isPreview: true,
              publicationIntent: "published",
              assetLogicalIds: ["asset-handout"],
              resources: [
                {
                  logicalId: "resource-1",
                  type: "download",
                  title: "Handout",
                  order: 0,
                  assetLogicalId: "asset-handout",
                },
              ],
            },
          ],
        },
      ],
    },
    assets: [
      {
        logicalId: "asset-handout",
        path: "assets/handout.pdf",
        sha256: checksum,
        byteLength: 20,
        mimeType: "application/pdf",
        visibility: "public",
      },
      {
        logicalId: "asset-cover",
        path: "assets/cover.png",
        sha256: "b".repeat(64),
        byteLength: 10,
        mimeType: "image/png",
        visibility: "public",
      },
    ],
  };
}

describe("course-export/v1", () => {
  it("produces deterministic canonical JSON and matches the neutral fixture", async () => {
    const first = serializeCourseExport(buildCourseExport(source()));
    const second = serializeCourseExport(buildCourseExport(source()));
    const fixture = (await readFile(
      path.join(process.cwd(), "fixtures/course-portability/course-export-v1.json"),
      "utf8",
    )).replace(/\r\n/g, "\n");

    expect(first).toBe(second);
    expect(first).toBe(fixture);
    expect(parseCourseExport(first).course.chapters.map((chapter) => chapter.logicalId)).toEqual(["chapter-1", "chapter-2"]);
  });

  it("requires explicit opt-in for private content", () => {
    const input = source();
    input.course.chapters[1]!.lessons[0]!.publicationIntent = "draft";

    expect(() => buildCourseExport(input)).toThrow(/includePrivate/);
    expect(buildCourseExport(input, { includePrivate: true }).course.chapters[0]!.lessons[0]!.publicationIntent).toBe("draft");

    const privateAsset = source();
    privateAsset.assets[0]!.visibility = "private";
    expect(() => buildCourseExport(privateAsset)).toThrow(/includePrivate/);
    expect(buildCourseExport(privateAsset, { includePrivate: true }).assets[1]!.visibility).toBe("private");
  });

  it("rejects excluded unknown fields and unknown versions", () => {
    const manifest = buildCourseExport(source()) as unknown as Record<string, unknown>;
    expect(() => parseCourseExport({ ...manifest, users: [{ email: "person@example.test" }] })).toThrow(/unknown field users/);
    expect(() => parseCourseExport({ ...manifest, schema: "course-export/v2" })).toThrow(/unsupported version/);
  });

  it.each([
    "assets/../secret.txt",
    "assets/%2e%2e/secret.txt",
    "assets/%252e%252e/secret.txt",
    "assets\\secret.txt",
    "/assets/secret.txt",
  ])("rejects unsafe asset path %s", (unsafePath) => {
    const manifest = buildCourseExport(source());
    manifest.assets[0]!.path = unsafePath;
    expect(() => parseCourseExport(manifest)).toThrow(/asset path/);
  });

  it("rejects duplicate IDs, invalid checksums, broken refs, and size budgets", () => {
    const duplicate = buildCourseExport(source());
    duplicate.course.chapters[1]!.logicalId = duplicate.course.chapters[0]!.logicalId;
    expect(() => parseCourseExport(duplicate)).toThrow(/duplicate logical ID/);

    const checksumManifest = buildCourseExport(source());
    checksumManifest.assets[0]!.sha256 = "not-a-checksum";
    expect(() => parseCourseExport(checksumManifest)).toThrow(/SHA-256/);

    const brokenRef = buildCourseExport(source());
    brokenRef.course.imageAssetLogicalId = "missing";
    expect(() => parseCourseExport(brokenRef)).toThrow(/unknown asset reference/);

    const oversize = serializeCourseExport(buildCourseExport(source()));
    expect(() => parseCourseExport(oversize, { maxDocumentBytes: 10 })).toThrow(/document size budget/);
    expect(() => parseCourseExport(oversize, { maxAssetBytes: 15 })).toThrow(/asset size budget/);
    expect(() => parseCourseExport(oversize, { maxTotalAssetBytes: 25 })).toThrow(/total asset size budget/);
  });
});

describe("course import planning and apply", () => {
  it("plans create, skip, conflict, and explicit update without side effects", () => {
    const manifest = buildCourseExport(source());
    const initial = planCourseImport(manifest, []);
    expect(initial.counts.create).toBe(6);

    const courseItem = initial.items.find((item) => item.kind === "course")!;
    const chapterItem = initial.items.find((item) => item.kind === "chapter")!;
    const existing = [
      { kind: courseItem.kind, logicalId: courseItem.logicalId, fingerprint: courseItem.fingerprint },
      { kind: chapterItem.kind, logicalId: chapterItem.logicalId, fingerprint: "different" },
    ];
    const safe = planCourseImport(manifest, existing);
    expect(safe.items.find((item) => item.logicalId === courseItem.logicalId)?.action).toBe("skip");
    expect(safe.items.find((item) => item.logicalId === chapterItem.logicalId)?.action).toBe("conflict");

    const overwrite = planCourseImport(manifest, existing, { overwriteExisting: true });
    expect(overwrite.items.find((item) => item.logicalId === chapterItem.logicalId)?.action).toBe("update");
  });

  it("refuses conflicts before opening a transaction", async () => {
    const manifest = buildCourseExport(source());
    const plan = planCourseImport(manifest, [{ kind: "course", logicalId: "course-1" }]);
    let transactions = 0;
    const repository: CourseImportRepository = {
      async transaction() {
        transactions += 1;
        throw new Error("must not run");
      },
    };

    await expect(applyCourseImportPlan(plan, repository)).rejects.toThrow(/unresolved conflicts/);
    expect(transactions).toBe(0);
  });

  it("applies through one transaction and rolls back when a writer fails", async () => {
    const plan = planCourseImport(buildCourseExport(source()), []);
    const durable: string[] = [];
    let transactions = 0;
    const repository: CourseImportRepository = {
      async transaction(work) {
        transactions += 1;
        const pending: string[] = [];
        try {
          const result = await work({
            async apply(item) {
              pending.push(`${item.kind}:${item.logicalId}`);
              if (pending.length === 2) throw new Error("simulated write failure");
            },
          });
          durable.push(...pending);
          return result;
        } catch (error) {
          pending.length = 0;
          throw error;
        }
      },
    };

    await expect(applyCourseImportPlan(plan, repository)).rejects.toThrow("simulated write failure");
    expect(transactions).toBe(1);
    expect(durable).toEqual([]);
  });

  it("applies every create once and rejects a manifest mutated after planning", async () => {
    const plan = planCourseImport(buildCourseExport(source()), []);
    const applied: string[] = [];
    let transactions = 0;
    const repository: CourseImportRepository = {
      async transaction(work) {
        transactions += 1;
        return work({
          async apply(item) {
            applied.push(`${item.kind}:${item.logicalId}`);
          },
        });
      },
    };

    await expect(applyCourseImportPlan(plan, repository)).resolves.toEqual({ applied: 6, skipped: 0 });
    expect(transactions).toBe(1);
    expect(new Set(applied).size).toBe(6);

    const mutated = planCourseImport(buildCourseExport(source()), []);
    mutated.manifest.course.title = "changed after planning";
    await expect(applyCourseImportPlan(mutated, repository)).rejects.toThrow(/fingerprint does not match/);
    expect(transactions).toBe(1);
  });
});
