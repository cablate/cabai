# CabAI banner — Open Knowledge Atelier

An independent banner concept for the open-source project: emerald glass pages, a sculptural book and layered typography. This is artwork, not a screenshot of the product.

Open `index.html` in a modern browser. It includes its own CSS and JavaScript and loads only the adjacent `background.png`; no package installation, remote fonts or credentials are needed.

- `index.html`: editable text, layout, short entrance animation and desktop pointer depth. The controls replay the entrance or switch to a static frame.
- `background.png`: AI-generated illustration made for this banner, with no embedded title or product UI.
- `banner-desktop.png`: 1440 × 720 static export for README or project promotion.
- `banner-mobile.png`: 390 × 702 mobile composition preview.

Add `?capture=1` to the HTML URL to hide preview controls and show the final static composition. Capture the `#banner` element at the desired viewport size. GitHub README does not run JavaScript, so use the PNG there.

Edit the HTML text and CSS variables to adapt the concept. Mobile uses a separate composition below 640 px of banner width. Reduced-motion starts in static mode, and the main content remains visible without JavaScript. The background is decorative brand artwork; the text stays in HTML.

The layout was drafted with Claude CLI and integrated and browser-checked with Codex. Code and accompanying artwork are supplied under the repository's Apache-2.0 terms to the extent applicable. No external stock assets or font files are bundled.
