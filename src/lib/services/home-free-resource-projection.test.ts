import { describe, expect, it } from "vitest";
import {
  buildHomeFreeResourceShadow,
  classifyHomeFreeResources,
  type HomeLibraryProjection,
  type HomeSkillProjection,
  type LegacyHomeFreeResource,
} from "./home-free-resource-projection";

function legacy(
  id: string,
  offeringType: LegacyHomeFreeResource["presentation"]["offeringType"],
  amount: number,
  title = `Resource ${id}`,
  slug: string | null = null,
): LegacyHomeFreeResource {
  return {
    plan: { id, slug, name: title, amount },
    presentation: {
      id: `presentation-${id}`,
      offeringType,
      title,
      subtitle: null,
      description: null,
    },
  };
}

const library: HomeLibraryProjection = {
  id: "library-1",
  slug: "owner-guide",
  title: "Owner Guide",
  summary: "Re-authored knowledge.",
  sourceLegacyPlanIds: ["guide-plan"],
};

const skill: HomeSkillProjection = {
  id: "skill-1",
  slug: "cab-helper",
  title: "Cab Helper",
  summary: "A versioned Skill artifact.",
  sourceLegacyPlanIds: ["skill-plan"],
};

describe("home free-resource classification preview", () => {
  it("matches the legacy homepage candidate rule and preserves public URLs", () => {
    const preview = classifyHomeFreeResources([
      legacy("event", "free_event", 500, "Free event", "free-event"),
      legacy("download", "download", 500),
      legacy("zero", "service", 0),
      legacy("paid", "service", 500),
    ]);

    expect(preview.rows.map((row) => row.legacyPlanId)).toEqual(["event", "download", "zero"]);
    expect(preview.rows[0]).toMatchObject({
      originalOwner: "event",
      originalPublicUrl: "/products/free-event",
      suggestedTarget: "products",
      effectiveTarget: "products",
      reason: { code: "legacy-domain-retained" },
    });
    expect(preview.rows[2]?.reason.code).toBe("zero-price-plan-retained");
  });

  it("applies reasoned owner overrides without changing the legacy owner or URL", () => {
    const items = [
      legacy("guide-plan", "download", 0, "Owner Guide", "legacy-guide"),
      legacy("skill-plan", "download", 0, "Cab Helper"),
      legacy("old-event", "free_event", 0),
    ];
    const preview = classifyHomeFreeResources(items, {
      ownerOverrides: {
        "guide-plan": { target: "library-reauthor", reason: "Owner approved independent Markdown." },
        "skill-plan": { target: "skills", reason: "Owner confirmed a versioned Skill artifact." },
        "old-event": { target: "suppress", reason: "Event has ended." },
      },
    });

    expect(preview.rows.map((row) => row.effectiveTarget)).toEqual([
      "library-reauthor",
      "skills",
      "suppress",
    ]);
    expect(preview.rows[0]).toMatchObject({
      originalOwner: "download",
      originalPublicUrl: "/products/legacy-guide",
      reason: { code: "owner-override", message: "Owner approved independent Markdown." },
    });
    expect(preview.counts).toEqual({ products: 0, "library-reauthor": 1, skills: 1, suppress: 1 });
  });

  it("rejects owner decisions without an auditable reason", () => {
    expect(() => classifyHomeFreeResources([legacy("guide-plan", "download", 0)], {
      ownerOverrides: { "guide-plan": { target: "library-reauthor", reason: "  " } },
    })).toThrow("requires a reason");
  });

  it("detects legacy and canonical duplicates using stable evidence", () => {
    const preview = classifyHomeFreeResources([
      legacy("guide-plan", "download", 0, "Owner Guide"),
      legacy("same-title", "free_event", 0, " owner  guide "),
      legacy("skill-plan", "download", 0, "Unrelated legacy title"),
    ], { libraries: [library], skills: [skill] });

    expect(preview.duplicatePlanIds).toEqual(["guide-plan", "same-title", "skill-plan"]);
    expect(preview.rows[0]?.duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "legacy", id: "same-title", basis: "normalized-title" }),
      expect.objectContaining({ kind: "library", id: "library-1", basis: "source-plan" }),
    ]));
    expect(preview.rows[2]?.duplicates).toContainEqual(expect.objectContaining({
      kind: "skill",
      id: "skill-1",
      basis: "source-plan",
    }));
  });

  it("is deterministic across dry-run reruns", () => {
    const items = [legacy("download", "download", 100), legacy("zero", "course", 0)];
    expect(classifyHomeFreeResources(items)).toEqual(classifyHomeFreeResources(items));
  });
});

describe("home free-resource shadow projection", () => {
  it("compares retained Products with mapped Library and Skill projections", () => {
    const preview = classifyHomeFreeResources([
      legacy("product-plan", "free_event", 0),
      legacy("guide-plan", "download", 0, "Owner Guide"),
      legacy("skill-plan", "download", 0, "Cab Helper"),
      legacy("ended-plan", "free_event", 0),
    ], {
      ownerOverrides: {
        "guide-plan": { target: "library-reauthor", reason: "Owner approved Markdown re-authoring." },
        "skill-plan": { target: "skills", reason: "Owner approved Skill ownership." },
        "ended-plan": { target: "suppress", reason: "No longer useful on home." },
      },
      libraries: [library],
      skills: [skill],
    });
    const shadow = buildHomeFreeResourceShadow({ preview, libraries: [library], skills: [skill] });

    expect(shadow.comparison).toEqual({
      status: "intentional-change",
      preservedPlanIds: ["product-plan"],
      reclassifiedPlanIds: ["guide-plan", "skill-plan"],
      suppressedPlanIds: ["ended-plan"],
      missingPlanIds: [],
      addedCanonicalKeys: [],
      duplicatePublicUrls: [],
    });
    expect(shadow.projected.map((item) => [item.owner, item.publicUrl])).toEqual([
      ["products", "/products/product-plan"],
      ["library", "/library/owner-guide"],
      ["skills", "/skills/cab-helper"],
    ]);
  });

  it("fails shadow parity when an approved owner projection is absent", () => {
    const preview = classifyHomeFreeResources([legacy("guide-plan", "download", 0, "Owner Guide")], {
      ownerOverrides: {
        "guide-plan": { target: "library-reauthor", reason: "Owner approved Markdown re-authoring." },
      },
    });

    expect(buildHomeFreeResourceShadow({ preview }).comparison).toMatchObject({
      status: "mismatch",
      missingPlanIds: ["guide-plan"],
    });
  });

  it("reports canonical additions and duplicate public URLs without mutating source projections", () => {
    const duplicateLibrary = { ...library, id: "library-2" };
    const libraries = [library, duplicateLibrary] as const;
    const snapshot = structuredClone(libraries);
    const preview = classifyHomeFreeResources([], { libraries });
    const shadow = buildHomeFreeResourceShadow({ preview, libraries });

    expect(shadow.comparison).toMatchObject({
      status: "mismatch",
      addedCanonicalKeys: ["library:library-1", "library:library-2"],
      duplicatePublicUrls: ["/library/owner-guide"],
    });
    expect(libraries).toEqual(snapshot);
  });
});
