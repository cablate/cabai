import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const uiRoot = join(root, "src", "components", "ui");
const sourceRoot = join(root, "src");
const rawPaletteLineBaseline = 874;
const tokenSource = readFileSync(join(root, "src", "app", "globals.css"), "utf8");
const catalogSource = readFileSync(join(root, "src", "app", "admin", "ui", "page.tsx"), "utf8");

const requiredTokens = [
  "--color-surface-elevated",
  "--color-surface-inverse",
  "--color-surface-code",
  "--color-overlay",
  "--color-border-strong",
  "--color-border-inverted",
  "--color-text-inverted",
  "--color-text-code",
];

const rawPalettePattern =
  /(?:bg|text|border|ring|outline|fill|stroke|from|via|to|prose)-(?:zinc|stone|slate|gray|neutral|red|orange|amber|yellow|green|emerald|teal|cyan|blue|indigo|violet|purple|pink|rose|white|black)(?:-|\/|\b)/;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

const violations = [];

for (const component of ["form-feedback.tsx", "data-table.tsx", "form-field.tsx"]) {
  if (!sourceFiles(uiRoot).some((file) => file.endsWith(component))) {
    violations.push(`src/components/ui/${component}: missing required UI foundation owner`);
  }
}

for (const catalogState of ["dirty", "saving", "saved", "failed", "conflict"]) {
  if (!catalogSource.includes(`state="${catalogState}"`)) {
    violations.push(`src/app/admin/ui/page.tsx: missing form state ${catalogState}`);
  }
}

for (const file of sourceFiles(uiRoot)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (rawPalettePattern.test(line)) {
      violations.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
    }
  });
}

const rawPaletteLines = sourceFiles(sourceRoot).reduce((count, file) => {
  return count + readFileSync(file, "utf8").split(/\r?\n/).filter((line) => rawPalettePattern.test(line)).length;
}, 0);
if (rawPaletteLines > rawPaletteLineBaseline) {
  violations.push(`src: raw palette lines increased from ${rawPaletteLineBaseline} to ${rawPaletteLines}`);
}

for (const token of requiredTokens) {
  if (!tokenSource.includes(`${token}:`)) {
    violations.push(`src/app/globals.css: missing required token ${token}`);
  }
}

if (violations.length > 0) {
  console.error("UI foundation guard failed:\n");
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(`UI foundation guard passed (raw palette lines: ${rawPaletteLines}/${rawPaletteLineBaseline}).`);
