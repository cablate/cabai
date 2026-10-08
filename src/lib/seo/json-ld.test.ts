// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { jsonLdScript, serializeJsonLd } from "./json-ld";

describe("JSON-LD HTML serialization", () => {
  it.each([
    '</script><script>window.injected=true</script>',
    '</ScRiPt ><img src=x onerror="window.injected=true">',
    '</script\n><svg onload="window.injected=true">',
    '<!--<script>nested</script>',
  ])("keeps attacker-controlled text inside the JSON script: %s", (payload) => {
    const data = { headline: payload, review: [{ author: payload, text: payload }] };
    const serialized = serializeJsonLd(data);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(data);
    const container = document.createElement("div");
    container.innerHTML = jsonLdScript(data) + '<p id="after">after</p>';
    expect(container.children).toHaveLength(2);
    expect(container.querySelectorAll("script")).toHaveLength(1);
    expect(container.querySelector("img, svg")).toBeNull();
    expect(JSON.parse(container.querySelector("script")!.textContent!)).toEqual(data);
    expect(container.lastElementChild?.id).toBe("after");
  });

  it("preserves legitimate multilingual content, nested values and JSON escaping", () => {
    const data = {
      "@context": "https://schema.org",
      name: '課程 <入門> & "進階" 😀',
      url: "https://example.com/course?q=a&b=c",
      description: "line\nnext\u2028paragraph\u2029end",
      offers: { price: 0, available: true, missing: null },
    };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
