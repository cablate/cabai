import { describe, expect, it } from "vitest";
import { getSubscribePage } from "./subscribe-page";

describe("subscribe configuration", () => {
  it("does not select any operator form by default", () => {
    expect(getSubscribePage({})).toMatchObject({ kitFormId: undefined, kitFormUid: undefined });
  });
  it("uses explicitly configured identifiers", () => {
    expect(getSubscribePage({ KIT_GENERAL_UPDATES_FORM_ID: "12345", KIT_GENERAL_UPDATES_FORM_UID: "example_uid" }))
      .toMatchObject({ kitFormId: "12345", kitFormUid: "example_uid" });
  });
  it("rejects unsafe identifiers without an operator fallback", () => {
    expect(getSubscribePage({ KIT_GENERAL_UPDATES_FORM_ID: "12345/other", KIT_GENERAL_UPDATES_FORM_UID: "uid with spaces" }))
      .toMatchObject({ kitFormId: undefined, kitFormUid: undefined });
  });
  it("does not interpret legacy selectors as an implicit integration", () => {
    expect(getSubscribePage({ KIT_UPDATES_JOIN_FORM_ID: "12345", KIT_UPDATES_JOIN_FORM_UID: "example_uid" }))
      .toMatchObject({ kitFormId: undefined, kitFormUid: undefined });
  });
});
