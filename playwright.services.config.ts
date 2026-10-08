import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (!base.webServer || Array.isArray(base.webServer)) {
  throw new Error("Service fixture tests require their own managed local server.");
}

// Synthetic UI fixtures only. Tests intercept OAuth and Kit requests; these
// values must never be replaced with a maintainer's real service credentials.
export default defineConfig({
  ...base,
  testMatch: ["community.spec.ts", "subscribe.spec.ts"],
  grep: /service fixture/,
  projects: [{ name: "services-enabled", use: { browserName: "chromium" }, metadata: { servicesEnabled: true } }],
  webServer: {
    ...base.webServer,
    reuseExistingServer: false,
    env: {
      ...base.webServer.env,
      AUTH_GOOGLE_ID: "synthetic-google-client",
      AUTH_GOOGLE_SECRET: "synthetic-google-secret-not-a-credential",
      KIT_GENERAL_UPDATES_FORM_ID: "12345",
      KIT_GENERAL_UPDATES_FORM_UID: "example_uid",
    },
  },
});
