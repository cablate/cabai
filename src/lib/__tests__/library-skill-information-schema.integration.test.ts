import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  agentInformationEvents,
  agentInformationItems,
  libraryEntries,
  skillReleases,
  skills,
  userAgentInformationReads,
} from "@/lib/db/schema";
import { cleanTestData, createTestUser } from "@/test/helpers";

describe("Library, Skill, and Agent Information database constraints", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("rejects duplicate Library slugs and invalid published lifecycle state", async () => {
    await db.insert(libraryEntries).values({
      slug: "system-news",
      title: "System news",
      summary: "Current CabAI information.",
      bodyMarkdown: "# System news",
    });

    await expect(db.insert(libraryEntries).values({
      slug: "system-news",
      title: "Duplicate",
      summary: "Duplicate slug.",
      bodyMarkdown: "# Duplicate",
    })).rejects.toThrow();

    await expect(db.insert(libraryEntries).values({
      slug: "missing-published-at",
      title: "Invalid publication",
      summary: "Published state without a publication time.",
      bodyMarkdown: "# Invalid",
      status: "published",
    })).rejects.toThrow();
  });

  it("rejects duplicate Skill versions and malformed checksums", async () => {
    const [skill] = await db.insert(skills).values({
      slug: "cabai-monitor",
      title: "CabAI Monitor",
      summary: "Monitoring helper Skill.",
    }).returning({ id: skills.id });

    await db.insert(skillReleases).values({
      skillId: skill!.id,
      version: "1.0.0",
    });

    await expect(db.insert(skillReleases).values({
      skillId: skill!.id,
      version: "1.0.0",
    })).rejects.toThrow();

    await expect(db.insert(skillReleases).values({
      skillId: skill!.id,
      version: "1.0.1",
      checksumSha256: "not-a-sha256",
    })).rejects.toThrow();
  });

  it("rejects duplicate Information and lifecycle-event idempotency keys", async () => {
    const [information] = await db.insert(agentInformationItems).values({
      dedupeKey: "library_entry:system-news:1",
      sourceType: "library_entry",
      sourceId: "library-system-news",
      sourceVersion: "1",
      kind: "library.published",
      title: "System news available",
      summary: "A new Library entry is available.",
    }).returning({ id: agentInformationItems.id });

    await expect(db.insert(agentInformationItems).values({
      dedupeKey: "library_entry:system-news:1",
      sourceType: "library_entry",
      sourceId: "another-source",
      sourceVersion: "1",
      kind: "library.published",
      title: "Duplicate Information",
      summary: "The dedupe key must remain unique.",
    })).rejects.toThrow();

    const event = {
      informationId: information!.id,
      idempotencyKey: "publish:library-system-news:1",
      fromStatus: "draft" as const,
      toStatus: "published" as const,
      actorType: "agent" as const,
      actorId: "agent-key:test",
      revision: 2,
    };
    await db.insert(agentInformationEvents).values(event);
    await expect(db.insert(agentInformationEvents).values(event)).rejects.toThrow();
  });

  it("stores one ACK per user and Information regardless of token identity", async () => {
    const user = await createTestUser();
    const [information] = await db.insert(agentInformationItems).values({
      dedupeKey: "api_operation:get-library:1",
      sourceType: "api_operation",
      sourceId: "getPublicLibraryEntry",
      sourceVersion: "1",
      kind: "api.available",
      title: "Library API available",
      summary: "Agents can read published Library entries.",
      status: "published",
      publishedAt: new Date(),
    }).returning({ id: agentInformationItems.id });

    const ack = {
      userId: user.id,
      informationId: information!.id,
    };
    await db.insert(userAgentInformationReads).values(ack);
    await expect(db.insert(userAgentInformationReads).values(ack)).rejects.toThrow();
  });
});
