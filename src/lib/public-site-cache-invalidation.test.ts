import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));

vi.mock("next/cache", () => ({ revalidateTag }));

import {
  expirePublicSiteCache,
} from "@/lib/public-site-cache-invalidation";
import { PUBLIC_SITE_CACHE_TAGS } from "@/lib/public-site-cache-tags";

describe("expirePublicSiteCache", () => {
  beforeEach(() => {
    revalidateTag.mockReset();
  });

  it("immediately expires each requested public catalog tag once", () => {
    expirePublicSiteCache("plans", "library", "plans", "skills");

    expect(revalidateTag.mock.calls).toEqual([
      [PUBLIC_SITE_CACHE_TAGS.plans, { expire: 0 }],
      [PUBLIC_SITE_CACHE_TAGS.library, { expire: 0 }],
      [PUBLIC_SITE_CACHE_TAGS.skills, { expire: 0 }],
    ]);
  });
});
