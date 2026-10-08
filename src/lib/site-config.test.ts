import { describe, expect, it } from "vitest";
import { assertSiteConfigKey, editableSiteConfigKeys } from "./site-config";

describe("editable site configuration allowlist", () => {
  it("contains only the reviewed non-secret setting", () => {
    expect(editableSiteConfigKeys).toEqual(["default_discord_role_id"]);
    expect(() => assertSiteConfigKey("default_discord_role_id")).not.toThrow();
  });

  it.each(["AUTH_SECRET", "DATABASE_URL", "PORTALY_API_KEY", "CRON_SECRET", "CONTACT_EMAIL"])(
    "rejects secret or environment-owned key %s",
    (key) => expect(() => assertSiteConfigKey(key)).toThrow("not editable"),
  );
});
