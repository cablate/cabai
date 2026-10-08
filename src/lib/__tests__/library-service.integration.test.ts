import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { libraryEntries } from "@/lib/db/schema";
import {
  createLibraryEntry,
  getPublishedLibraryEntry,
  listPublishedLibraryEntries,
  publishLibraryEntry,
  updateLibraryEntry,
  withdrawLibraryEntry,
} from "@/lib/services/library-service";
import { cleanTestData } from "@/test/helpers";
import { eq } from "drizzle-orm";

beforeAll(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
});

describe("Library service persistence contract", () => {
  it("accepts a server-owned deterministic ID for retry-safe Agent creates", async () => {
    const resourceId = `idem_${"b".repeat(48)}`;
    const created = await createLibraryEntry({
      slug: "idempotent-library",
      title: "Idempotent Library",
      summary: "Created with a server-owned ID",
      bodyMarkdown: "Body",
    }, { resourceId });
    expect(created).toMatchObject({ ok: true, value: { id: resourceId } });
  });

  it("creates an unsafe draft verbatim but blocks publish readiness", async () => {
    const bodyMarkdown = "Before <script>alert(1)</script> after";
    const created = await createLibraryEntry({
      slug: "unsafe-draft",
      title: "Unsafe draft",
      summary: "Saved for correction",
      bodyMarkdown,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const saved = await db.query.libraryEntries.findFirst({
      where: eq(libraryEntries.id, created.value.id),
    });
    expect(saved?.bodyMarkdown).toBe(bodyMarkdown);

    const published = await publishLibraryEntry({ id: created.value.id, expectedRevision: 1 });
    expect(published).toMatchObject({ ok: false, kind: "validation-failed" });
  });

  it("uses revision CAS so a stale draft writer performs no overwrite", async () => {
    const created = await createLibraryEntry({
      slug: "revision-cas",
      title: "Original",
      summary: "Summary",
      bodyMarkdown: "Body",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await updateLibraryEntry(created.value.id, { expectedRevision: 1, title: "Winner" });
    expect(first).toMatchObject({ ok: true, value: { revision: 2, title: "Winner" } });
    const stale = await updateLibraryEntry(created.value.id, { expectedRevision: 1, title: "Loser" });
    expect(stale).toMatchObject({ ok: false, kind: "stale-revision" });

    const saved = await db.query.libraryEntries.findFirst({
      where: eq(libraryEntries.id, created.value.id),
    });
    expect(saved).toMatchObject({ revision: 2, title: "Winner" });
  });

  it("publishes and withdraws while exposing bodyMarkdown only from public detail", async () => {
    const created = await createLibraryEntry({
      slug: "public-entry",
      title: "Public entry",
      summary: "Public summary",
      bodyMarkdown: "[PDF](https://example.com/a.pdf) and [Skill](/skills/x)",
      tags: ["announcement"],
      featured: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    vi.mocked(revalidateTag).mockClear();
    const published = await publishLibraryEntry({ id: created.value.id, expectedRevision: 1 });
    expect(published).toMatchObject({ ok: true, value: { status: "published", revision: 2 } });
    if (!published.ok) return;
    expect(revalidateTag).toHaveBeenCalledWith("public-site-library", { expire: 0 });
    const publishedAt = published.value.publishedAt;
    const updated = await updateLibraryEntry(created.value.id, {
      expectedRevision: 2,
      bodyMarkdown: "Corrected public material",
    });
    expect(updated).toMatchObject({
      ok: true,
      value: {
        status: "published",
        slug: "public-entry",
        revision: 3,
        bodyMarkdown: "Corrected public material",
        publishedAt,
      },
    });
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(await updateLibraryEntry(created.value.id, {
      expectedRevision: 3,
      slug: "changed-public-url",
    })).toMatchObject({ ok: false, kind: "validation-failed" });
    expect(await updateLibraryEntry(created.value.id, {
      expectedRevision: 2,
      title: "Stale public overwrite",
    })).toMatchObject({ ok: false, kind: "stale-revision" });

    const list = await listPublishedLibraryEntries();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((item) => item.id === created.value.id)).not.toHaveProperty("bodyMarkdown");
    }
    const detail = await getPublishedLibraryEntry("public-entry");
    expect(detail).toMatchObject({ ok: true, value: { bodyMarkdown: "Corrected public material", revision: 3 } });
    expect(await getPublishedLibraryEntry(created.value.id)).toMatchObject({
      ok: true,
      value: { id: created.value.id, slug: "public-entry", bodyMarkdown: "Corrected public material" },
    });

    const withdrawn = await withdrawLibraryEntry({ id: created.value.id, expectedRevision: 3 });
    expect(withdrawn).toMatchObject({ ok: true, value: { status: "withdrawn", revision: 4 } });
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(await updateLibraryEntry(created.value.id, {
      expectedRevision: 4,
      bodyMarkdown: "Withdrawn overwrite",
    })).toMatchObject({ ok: false, kind: "immutable" });
    expect(await getPublishedLibraryEntry("public-entry")).toMatchObject({ ok: false, kind: "not-found" });
  });
});
