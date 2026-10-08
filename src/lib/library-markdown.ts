import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { ReadinessIssue } from "@/lib/services/library-skill-information-domain";

export const LIBRARY_LIMITS = {
  slug: 120,
  title: 200,
  summary: 600,
  bodyMarkdown: 100_000,
  tags: 20,
  tag: 50,
} as const;

export type LibraryMarkdownInput = {
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: readonly string[];
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const controlCharacterPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const markdownParser = new MarkdownIt({ html: true, linkify: false });
markdownParser.validateLink = () => true;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/i,
] as const;

function issue(
  code: ReadinessIssue["code"],
  field: string,
  message: string,
): ReadinessIssue {
  return { code, field, severity: "error", message };
}

function uniqueIssues(issues: ReadinessIssue[]): ReadinessIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.code}:${item.field}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isAllowedDestination(destination: string): boolean {
  if (
    destination.startsWith("/") && !destination.startsWith("//") ||
    destination.startsWith("./") ||
    destination.startsWith("../") ||
    destination.startsWith("#") ||
    destination.startsWith("?")
  ) {
    return !controlCharacterPattern.test(destination);
  }

  try {
    const url = new URL(destination);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function flattenTokens(tokens: Token[]): Token[] {
  const flattened: Token[] = [];
  for (const token of tokens) {
    flattened.push(token);
    if (token.children) flattened.push(...flattenTokens(token.children));
  }
  return flattened;
}

export function inspectLibraryMarkdown(markdown: string): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const tokens = flattenTokens(markdownParser.parse(markdown, {}));

  if (controlCharacterPattern.test(markdown)) {
    issues.push(issue("invalid_format", "bodyMarkdown", "Markdown must not contain control characters."));
  }
  if (tokens.some((token) => token.type === "html_block" || token.type === "html_inline")) {
    issues.push(issue("unsafe_markdown_html", "bodyMarkdown", "Raw HTML is not allowed in Library Markdown."));
  }
  if (tokens.some((token) => token.type === "image")) {
    issues.push(issue("unsafe_markdown_image", "bodyMarkdown", "Markdown images are not allowed in Library content."));
  }
  const destinations = tokens.flatMap((token) => {
    if (token.type !== "link_open") return [];
    const href = token.attrGet("href");
    return href ? [href] : [];
  });
  if (destinations.some((destination) => !isAllowedDestination(destination))) {
    issues.push(issue(
      "unsafe_link_protocol",
      "bodyMarkdown",
      "Links must use https or an allowed site-relative destination.",
    ));
  }

  return uniqueIssues(issues);
}

export function inspectLibraryFields(input: LibraryMarkdownInput): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const required = [
    ["slug", input.slug],
    ["title", input.title],
    ["summary", input.summary],
    ["bodyMarkdown", input.bodyMarkdown],
  ] as const;

  for (const [field, value] of required) {
    if (value.trim().length === 0) {
      issues.push(issue("required", field, `${field} is required.`));
    }
  }
  if (input.slug.length > LIBRARY_LIMITS.slug || (input.slug.length > 0 && !slugPattern.test(input.slug))) {
    issues.push(issue("invalid_format", "slug", "Slug must be lowercase kebab-case and at most 120 characters."));
  }
  for (const [field, value, maximum] of [
    ["title", input.title, LIBRARY_LIMITS.title],
    ["summary", input.summary, LIBRARY_LIMITS.summary],
    ["bodyMarkdown", input.bodyMarkdown, LIBRARY_LIMITS.bodyMarkdown],
  ] as const) {
    if (value.length > maximum) {
      issues.push(issue("invalid_format", field, `${field} must be at most ${maximum} characters.`));
    }
  }
  if (input.tags.length > LIBRARY_LIMITS.tags) {
    issues.push(issue("invalid_format", "tags", `At most ${LIBRARY_LIMITS.tags} tags are allowed.`));
  }
  if (input.tags.some((tag) => tag.trim().length === 0 || tag.length > LIBRARY_LIMITS.tag)) {
    issues.push(issue("invalid_format", "tags", `Tags must be non-empty and at most ${LIBRARY_LIMITS.tag} characters.`));
  }
  if (new Set(input.tags).size !== input.tags.length) {
    issues.push(issue("invalid_format", "tags", "Tags must be unique."));
  }

  const secretFields = [
    ["title", input.title],
    ["summary", input.summary],
    ["bodyMarkdown", input.bodyMarkdown],
    ["tags", input.tags.join("\n")],
  ] as const;
  for (const [field, value] of secretFields) {
    if (secretPatterns.some((pattern) => pattern.test(value))) {
      issues.push(issue("possible_secret", field, `${field} may contain a credential or secret.`));
    }
  }

  return uniqueIssues([...issues, ...inspectLibraryMarkdown(input.bodyMarkdown)]);
}
