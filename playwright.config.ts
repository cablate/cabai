import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.test")) process.loadEnvFile(".env.test");

const port = Number.parseInt(process.env.E2E_PORT ?? "3100", 10);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
// Keep the test runner and the Next.js child process on the same origin. Auth.js
// uses these values when issuing and validating the bootstrap session cookie.
process.env.AUTH_URL = baseURL;
process.env.NEXTAUTH_URL = baseURL;
process.env.NEXT_PUBLIC_APP_URL = baseURL;
// Warm the heaviest public route before tests begin. On slower workspaces the
// first Next compilation can otherwise consume the learner flow's total timeout.
const webServerReadyPath = process.env.E2E_READY_PATH ?? "/";
const bootstrapToken =
  process.env.ADMIN_BOOTSTRAP_TOKEN ?? "cabai-e2e-bootstrap-token-32-characters";
const devCommand = process.env.CI
  ? `npm run dev -- -p ${port}`
  : `npm run dev -- --webpack -p ${port}`;

process.env.ADMIN_BOOTSTRAP_TOKEN = bootstrapToken;

function stringEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      ADMIN_BOOTSTRAP_TOKEN: bootstrapToken,
      NEXT_PUBLIC_APP_URL: baseURL,
      AUTH_URL: baseURL,
      NEXTAUTH_URL: baseURL,
      NODE_ENV: "development",
      // Default acceptance proves a fresh install needs no external accounts.
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      KIT_GENERAL_UPDATES_FORM_ID: "",
      KIT_GENERAL_UPDATES_FORM_UID: "",
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results/playwright",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.E2E_EXTERNAL_SERVER === "1"
    ? undefined
    : {
        // Isolated local worktrees use a node_modules junction, which
        // Turbopack rejects. CI has a normal install and keeps the faster
        // default dev bundler so browser compilation stays within its budget.
        command: devCommand,
        url: `${baseURL}${webServerReadyPath}`,
        env: stringEnvironment(),
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
