import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  RuntimeNextConfigError,
  canonicalServerActionHost,
  withRuntimeServerActionOrigin,
} from "./runtime-next-config.mjs";

const require = createRequire(import.meta.url);
const { isCsrfOriginAllowed } = require("next/dist/server/app-render/csrf-protection");

test("canonical production origin is merged into Server Action allowed origins", () => {
  const bakedConfig = {
    experimental: {
      serverActions: {
        allowedOrigins: ["existing.example", "learning.example.com"],
        bodySizeLimit: "1mb",
      },
    },
  };
  const before = structuredClone(bakedConfig);

  const runtimeConfig = withRuntimeServerActionOrigin(
    bakedConfig,
    "https://learning.example.com",
  );

  assert.deepEqual(runtimeConfig.experimental.serverActions, {
    allowedOrigins: ["existing.example", "learning.example.com"],
    bodySizeLimit: "1mb",
  });
  assert.deepEqual(bakedConfig, before);
  assert.notStrictEqual(runtimeConfig, bakedConfig);
  assert.notStrictEqual(runtimeConfig.experimental, bakedConfig.experimental);
  assert.equal(
    isCsrfOriginAllowed(
      "learning.example.com",
      runtimeConfig.experimental.serverActions.allowedOrigins,
    ),
    true,
  );
});

test("canonical host keeps an explicit port and never includes scheme or path", () => {
  assert.equal(canonicalServerActionHost("http://localhost:3000"), "localhost:3000");
  assert.equal(canonicalServerActionHost("https://LEARNING.EXAMPLE.COM"), "learning.example.com");
});

for (const value of [
  "",
  "not-a-url",
  "ftp://learning.example.com",
  "https://user:password@learning.example.com",
  "https://learning.example.com/path",
  "https://learning.example.com/?debug=1",
  "https://learning.example.com/#fragment",
]) {
  test(`invalid canonical app URL is rejected: ${value || "<empty>"}`, () => {
    assert.throws(
      () => canonicalServerActionHost(value),
      (error) => error instanceof RuntimeNextConfigError
        && error.code === "CANONICAL_APP_URL_INVALID",
    );
  });
}
