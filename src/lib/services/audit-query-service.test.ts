import { describe, expect, it } from "vitest";
import { decodeAuditCursor, encodeAuditCursor } from "./audit-query-service";

describe("audit cursor", () => {
  it("round-trips a stable createdAt/id cursor", () => {
    const cursor = { createdAt: "2026-09-27T00:00:00.000Z", id: "audit-1" };
    expect(decodeAuditCursor(encodeAuditCursor(cursor))).toEqual(cursor);
  });

  it.each(["", "not-base64", Buffer.from("{}").toString("base64url")])("fails closed for invalid cursor %s", (value) => {
    expect(decodeAuditCursor(value)).toBeNull();
  });
});
