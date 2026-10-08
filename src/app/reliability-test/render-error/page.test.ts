import { afterEach, describe, expect, it } from "vitest";
import ReliabilityRenderErrorPage from "./page";

const originalEnabled = process.env.RELIABILITY_TESTS_ENABLED;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.RELIABILITY_TESTS_ENABLED;
  else process.env.RELIABILITY_TESTS_ENABLED = originalEnabled;
});

describe("render reliability failure injection", () => {
  it("throws only when the probe is explicitly enabled", () => {
    process.env.RELIABILITY_TESTS_ENABLED = "true";
    expect(() => ReliabilityRenderErrorPage()).toThrowError("CABAI_RELIABILITY_TEST_RENDER_ERROR");
  });

  it("is hidden when the probe is disabled", () => {
    delete process.env.RELIABILITY_TESTS_ENABLED;
    expect(() => ReliabilityRenderErrorPage()).toThrow();
    try {
      ReliabilityRenderErrorPage();
    } catch (error) {
      expect(String(error)).not.toContain("CABAI_RELIABILITY_TEST_RENDER_ERROR");
    }
  });
});
