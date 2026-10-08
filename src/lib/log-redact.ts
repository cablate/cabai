/**
 * Centralized PII redaction helpers for logger payloads.
 *
 * Logs are shipped to console + winston file transport (and downstream
 * to whatever ingests stdout in production). PII that ends up here can
 * leak through log aggregation, error tracking, or operator screenshots.
 * Always pass user-derived strings through the appropriate helper before
 * including them in a logger payload.
 *
 * Helpers degrade gracefully: nullish / malformed input returns a
 * descriptive sentinel ("<empty>", "<malformed>") instead of throwing, so
 * a log call is never broken by bad input.
 */

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "<empty>";
  const at = email.indexOf("@");
  if (at <= 0) return "<malformed>";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function maskToken(token: string | null | undefined): string {
  if (!token) return "<empty>";
  if (token.length < 8) return "<short>";
  return `${token.slice(0, 4)}…${token.slice(-2)}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "<empty>";
  const trimmed = phone.replace(/\s+/g, "");
  return trimmed.length > 4 ? `***${trimmed.slice(-4)}` : "***";
}

/**
 * Hash an identifier to a short, non-reversible tag. Useful when you want
 * to correlate log lines for the same subject without storing the raw id.
 */
export function tagId(id: string | null | undefined): string {
  if (!id) return "<empty>";
  // Cheap, non-crypto hash — enough to correlate within a session.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return `id:${(h >>> 0).toString(36)}`;
}
