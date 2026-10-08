import { describe, expect, it, vi } from "vitest";
import type { PublicProductCatalogItem } from "./public-product-catalog";
import { loadPublicProductCatalog } from "./public-product-catalog";

describe("loadPublicProductCatalog", () => {
  it("returns only the published-presentation query result", async () => {
    const item = { plan: {}, presentation: {} } as PublicProductCatalogItem;
    const query = vi.fn().mockResolvedValue([item]);

    await expect(loadPublicProductCatalog(query)).resolves.toEqual({
      state: "ready",
      items: [item],
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("keeps an empty published set empty", async () => {
    await expect(
      loadPublicProductCatalog(vi.fn().mockResolvedValue([])),
    ).resolves.toEqual({ state: "empty", items: [] });
  });

  it("fails closed when the published-presentation query fails", async () => {
    const error = new Error("query unavailable");

    await expect(
      loadPublicProductCatalog(vi.fn().mockRejectedValue(error)),
    ).resolves.toEqual({ state: "error", items: [], error });
  });
});
