import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  agentInformationItems,
  userAgentInformationReads,
  userApiTokens,
} from "@/lib/db/schema";
import { cleanTestData, createTestUser } from "@/test/helpers";
import { getAgentAdoptionOverview } from "./agent-adoption";

const now = new Date("2026-07-31T00:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function createToken(
  userId: string,
  suffix: string,
  createdAt: Date,
  lastUsedAt: Date | null = null,
) {
  await db.insert(userApiTokens).values({
    userId,
    tokenHash: `hash-${suffix}`,
    tokenPrefix: `cab_user_${suffix}`,
    scopes: ["information:read", "information:ack"],
    createdAt,
    lastUsedAt,
  });
}

async function acknowledge(userId: string, suffix: string, readAt: Date) {
  const informationId = `information-${suffix}`;
  await db.insert(agentInformationItems).values({
    id: informationId,
    dedupeKey: `dedupe-${suffix}`,
    sourceType: "manual_announcement",
    sourceId: `source-${suffix}`,
    sourceVersion: "1",
    kind: "manual_announcement",
    title: `Information ${suffix}`,
    summary: "Agent adoption measurement fixture",
    status: "published",
    publishedAt: daysAgo(60),
  });
  await db.insert(userAgentInformationReads).values({
    userId,
    informationId,
    readAt,
  });
}

describe("Agent adoption measurement", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("counts users once across multiple tokens and multiple ACKs", async () => {
    const first = await createTestUser();
    const second = await createTestUser();

    await createToken(first.id, "first-a", daysAgo(10), daysAgo(8));
    await createToken(first.id, "first-b", daysAgo(5), daysAgo(2));
    await acknowledge(first.id, "first-a", daysAgo(7));
    await acknowledge(first.id, "first-b", daysAgo(1));
    await createToken(second.id, "second", daysAgo(4));

    await expect(getAgentAdoptionOverview(now)).resolves.toEqual({
      last30Days: { created: 2, used: 1, acknowledged: 1 },
      allTime: { created: 2, used: 1, acknowledged: 1 },
    });
  });

  it("uses the first token date for cohort membership", async () => {
    const returning = await createTestUser();
    const recent = await createTestUser();

    await createToken(returning.id, "returning-old", daysAgo(45), daysAgo(40));
    await createToken(returning.id, "returning-new", daysAgo(2), daysAgo(1));
    await createToken(recent.id, "recent", daysAgo(3), daysAgo(2));

    await expect(getAgentAdoptionOverview(now)).resolves.toEqual({
      last30Days: { created: 1, used: 1, acknowledged: 0 },
      allTime: { created: 2, used: 2, acknowledged: 0 },
    });
  });

  it("treats a persisted ACK as proof that a valid key was used", async () => {
    const user = await createTestUser();
    await createToken(user.id, "ack-only", daysAgo(5));
    await acknowledge(user.id, "ack-only", daysAgo(4));

    await expect(getAgentAdoptionOverview(now)).resolves.toEqual({
      last30Days: { created: 1, used: 1, acknowledged: 1 },
      allTime: { created: 1, used: 1, acknowledged: 1 },
    });
  });
});
