import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { eventsRaw } from "./schema";

describe("event tracking truth fields", () => {
  it("keeps occurrence, recording time, and source as separate fields", () => {
    const config = getTableConfig(eventsRaw);
    const columns = config.columns.map((column) => column.name);
    const indexes = config.indexes.map((index) => index.config.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        "event_type",
        "properties",
        "occurred_at",
        "source",
        "created_at",
      ]),
    );
    expect(indexes).toContain("idx_events_source_type_occurred_at");
  });

  it("backfills existing occurrence time from the original recorded time", () => {
    const migration = readFileSync(
      new URL("../../../drizzle/0019_quick_colonel_america.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain(
      'UPDATE "events_raw" SET "occurred_at" = "created_at"',
    );
    expect(migration).toContain(
      'ALTER TABLE "events_raw" ADD COLUMN "source" text DEFAULT \'legacy\' NOT NULL',
    );
  });
});
