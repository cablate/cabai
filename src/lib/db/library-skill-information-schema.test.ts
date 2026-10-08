import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  agentInformationEvents,
  agentInformationItems,
  libraryEntries,
  skillReleases,
  skills,
  userAgentInformationReads,
} from "./schema";

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

function checkNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).checks.map((constraint) => constraint.name);
}

function indexNames(table: Parameters<typeof getTableConfig>[0]): Array<string | undefined> {
  return getTableConfig(table).indexes.map((index) => index.config.name);
}

describe("Library, Skill, and Agent Information schema foundation", () => {
  it("defines the six additive domain tables", () => {
    expect([
      libraryEntries,
      skills,
      skillReleases,
      agentInformationItems,
      agentInformationEvents,
      userAgentInformationReads,
    ].map((table) => getTableConfig(table).name)).toEqual([
      "library_entries",
      "skills",
      "skill_releases",
      "agent_information_items",
      "agent_information_events",
      "user_agent_information_reads",
    ]);
  });

  it("keeps Library as a Markdown information surface instead of an attachment owner", () => {
    expect(columnNames(libraryEntries)).toEqual(expect.arrayContaining([
      "slug",
      "title",
      "summary",
      "body_markdown",
      "tags",
      "featured",
      "status",
      "revision",
    ]));
    expect(columnNames(libraryEntries)).not.toEqual(expect.arrayContaining([
      "artifact_media_id",
      "delivery_type",
      "target_json",
    ]));
    expect(indexNames(libraryEntries)).toEqual(expect.arrayContaining([
      "idx_library_entries_slug_unique",
      "idx_library_entries_published_feed",
      "idx_library_entries_featured",
    ]));
    expect(checkNames(libraryEntries)).toEqual(expect.arrayContaining([
      "chk_library_entries_status",
      "chk_library_entries_revision_positive",
      "chk_library_entries_lifecycle",
    ]));
  });

  it("protects Skill release identity, artifact binding, and lifecycle", () => {
    const config = getTableConfig(skillReleases);

    expect(columnNames(skillReleases)).toEqual(expect.arrayContaining([
      "skill_id",
      "version",
      "artifact_media_id",
      "checksum_sha256",
      "content_markdown",
      "access_policy",
      "status",
    ]));
    expect(config.foreignKeys).toHaveLength(2);
    expect(indexNames(skillReleases)).toEqual(expect.arrayContaining([
      "idx_skill_releases_skill_version_unique",
      "idx_skill_releases_artifact_unique",
    ]));
    expect(checkNames(skillReleases)).toEqual(expect.arrayContaining([
      "chk_skill_releases_access_policy",
      "chk_skill_releases_checksum",
      "chk_skill_releases_published_artifact",
      "chk_skill_releases_lifecycle",
    ]));
  });

  it("gives Information a dedupe identity, source tuple, feed index, and event idempotency", () => {
    expect(indexNames(agentInformationItems)).toEqual(expect.arrayContaining([
      "idx_agent_information_dedupe_unique",
      "idx_agent_information_source",
      "idx_agent_information_unread_feed",
    ]));
    expect(checkNames(agentInformationItems)).toEqual(expect.arrayContaining([
      "chk_agent_information_source_type",
      "chk_agent_information_audience",
      "chk_agent_information_lifecycle",
    ]));
    expect(indexNames(agentInformationEvents)).toContain(
      "idx_agent_information_events_idempotency_unique",
    );
  });

  it("stores ACK identity as one composite user-information primary key", () => {
    const config = getTableConfig(userAgentInformationReads);

    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]!.columns.map((column) => column.name)).toEqual([
      "user_id",
      "information_id",
    ]);
    expect(config.foreignKeys).toHaveLength(2);
  });

  it("tracks one additive migration without legacy data mutation", () => {
    const migration = readFileSync(
      new URL("../../../drizzle/0014_library_skill_information_foundation.sql", import.meta.url),
      "utf8",
    );

    expect(migration.match(/^CREATE TABLE /gm)).toHaveLength(6);
    expect(migration).toContain(
      'ALTER TABLE "user_api_tokens" ALTER COLUMN "scopes" SET DEFAULT',
    );
    expect(migration).not.toMatch(/^\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/im);
  });

  it("adds standalone and public course announcement source support additively", () => {
    const migration = readFileSync(
      new URL("../../../drizzle/0016_peaceful_the_phantom.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain("manual_announcement");
    expect(migration).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE)\b/i);
  });
});
