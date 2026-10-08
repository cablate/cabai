import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventsRaw, users } from "@/lib/db/schema";
import { cleanTestData, createTestUser } from "@/test/helpers";
import {
  listTrackingPage,
  TRACKING_MAX_PAGE_SIZE,
} from "@/lib/services/tracking-query-service";

describe("tracking query service", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("bounds page size and returns only the requested user projection", async () => {
    const observedAt = new Date("2026-09-27T12:00:00.000Z");
    const baseline = await listTrackingPage({ pageSize: 1, now: observedAt });
    const alice = await createTestUser({
      email: "test-tracking-alice@example.com",
      name: "Alice Chen",
    });
    const bob = await createTestUser({
      email: "test-tracking-bob@example.com",
      name: "Bob Lin",
    });
    const inactive = await createTestUser({
      email: "test-tracking-inactive@example.com",
      name: "Old Account",
    });
    await db.update(users).set({ lastActiveAt: new Date("2026-09-26T12:00:00.000Z") }).where(eq(users.id, alice.id));
    await db.update(users).set({ lastActiveAt: null }).where(eq(users.id, bob.id));
    await db.update(users).set({ lastActiveAt: new Date("2026-09-19T12:00:00.000Z") }).where(eq(users.id, inactive.id));
    await db.insert(eventsRaw).values([
      {
        userId: alice.id,
        eventType: "page_view",
        occurredAt: new Date("2026-09-26T11:00:00.000Z"),
        createdAt: new Date("2026-09-26T11:00:00.000Z"),
        source: "web",
      },
      {
        userId: alice.id,
        eventType: "product_viewed",
        occurredAt: new Date("2026-09-26T11:30:00.000Z"),
        createdAt: new Date("2026-09-26T11:30:00.000Z"),
        source: "web",
      },
      {
        userId: bob.id,
        eventType: "lesson_started",
        occurredAt: new Date("2026-09-25T11:00:00.000Z"),
        createdAt: new Date("2026-09-25T11:00:00.000Z"),
        source: "web",
      },
    ]);

    const first = await listTrackingPage({
      sort: "eventCount",
      direction: "desc",
      search: "test-tracking-",
      pageSize: 1,
      now: observedAt,
    });
    expect(first.items.map((row) => row.id)).toEqual([alice.id]);
    expect(first.items[0]).not.toHaveProperty("email");
    expect(first.filteredCount).toBe(3);
    expect(first.totalUsers).toBe(baseline.totalUsers + 3);
    expect(first.activeUsers).toBe(baseline.activeUsers + 2);
    expect(first.inactiveUsers).toBe(baseline.inactiveUsers + 2);
    expect(first.nextCursor).toBeTruthy();

    const second = await listTrackingPage({
      sort: "eventCount",
      direction: "desc",
      search: "test-tracking-",
      pageSize: 1,
      cursor: first.nextCursor ?? undefined,
      now: observedAt,
    });
    expect(second.items.map((row) => row.id)).toEqual([bob.id]);
    expect(second.previousCursor).toBeTruthy();

    const previous = await listTrackingPage({
      sort: "eventCount",
      direction: "desc",
      search: "test-tracking-",
      pageSize: 1,
      cursor: second.previousCursor ?? undefined,
      now: observedAt,
    });
    expect(previous.items.map((row) => row.id)).toEqual([alice.id]);

    const lastPage = await listTrackingPage({
      sort: "eventCount",
      direction: "desc",
      search: "test-tracking-",
      pageSize: 1,
      edge: "last",
      now: observedAt,
    });
    expect(lastPage.items.map((row) => row.id)).toEqual([inactive.id]);
    expect(lastPage.nextCursor).toBeNull();
    expect(lastPage.previousCursor).toBeTruthy();

    const capped = await listTrackingPage({ search: "test-tracking-", pageSize: 999, now: observedAt });
    expect(capped.pageSize).toBe(TRACKING_MAX_PAGE_SIZE);
    expect(capped.items).toHaveLength(3);
  });

  it("searches name or email on the server and includes email only when requested", async () => {
    const user = await createTestUser({
      email: "test-tracking-search@example.com",
      name: "Needle Member",
    });

    const byEmail = await listTrackingPage({ search: "tracking-search@example.com" });
    expect(byEmail.filteredCount).toBe(1);
    expect(byEmail.items.map((row) => row.id)).toEqual([user.id]);
    expect(byEmail.items[0]).not.toHaveProperty("email");

    const byNameWithEmail = await listTrackingPage({ search: "Needle", includeEmail: true });
    expect(byNameWithEmail.items[0]).toMatchObject({
      id: user.id,
      email: "test-tracking-search@example.com",
    });
  });

});
