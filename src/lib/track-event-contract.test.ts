import { describe, expect, it } from "vitest";
import { parseTrackEvent } from "@/lib/track-event-contract";

describe("track event contract", () => {
  it("accepts a pathname and normalized attribution", () => {
    expect(parseTrackEvent({
      event: "page_view",
      properties: { path: "/community", source: " cablate ", email: "private@example.com" },
    })).toEqual({
      event: "page_view",
      properties: { path: "/community", source: "cablate" },
    });
  });

  it("rejects query-bearing paths and unknown events", () => {
    expect(parseTrackEvent({ event: "page_view", properties: { path: "/community?email=x" } })).toBeNull();
    expect(parseTrackEvent({ event: "made_up", properties: {} })).toBeNull();
  });

  it("keeps only event-specific properties", () => {
    expect(parseTrackEvent({
      event: "product_cta_clicked",
      properties: { planId: "plan-1", type: "external", discordId: "123", arbitrary: "value" },
    })).toEqual({
      event: "product_cta_clicked",
      properties: { planId: "plan-1", type: "external" },
    });
  });

  it("requires resource identity", () => {
    expect(parseTrackEvent({ event: "resource_opened", properties: { resourceTitle: "Guide" } })).toBeNull();
  });
});
