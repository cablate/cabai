import { describe, expect, it } from "vitest";
import {
  hasInformationListFilters,
  informationListHref,
  parseInformationListSearchParams,
} from "./information-list-query";

describe("Information admin list query", () => {
  it("normalizes invalid and repeated URL values without casting arbitrary enums", () => {
    expect(parseInformationListSearchParams({
      q: ["  release notes  ", "ignored"],
      view: "unknown",
      status: "deleted",
      sourceType: "library_entry",
      audience: "all_users",
      sort: "random",
      page: "-3",
    })).toEqual({
      query: "release notes",
      view: "active",
      status: undefined,
      sourceType: "library_entry",
      audience: "all_users",
      sort: "updated_desc",
      page: 1,
    });
  });

  it("builds durable pagination links while omitting default noise", () => {
    const filters = parseInformationListSearchParams({
      q: "codex",
      view: "history",
      status: "published",
      sourceType: "library_entry",
      sort: "published_desc",
      page: "2",
    });

    expect(informationListHref(filters, { page: 3 })).toBe(
      "/admin/information?q=codex&view=history&status=published&sourceType=library_entry&sort=published_desc&page=3",
    );
    expect(informationListHref(parseInformationListSearchParams({}), { page: 1 })).toBe("/admin/information");
  });

  it("distinguishes a filtered no-result view from an empty system", () => {
    expect(hasInformationListFilters(parseInformationListSearchParams({}))).toBe(false);
    expect(hasInformationListFilters(parseInformationListSearchParams({ q: "missing" }))).toBe(true);
  });
});
