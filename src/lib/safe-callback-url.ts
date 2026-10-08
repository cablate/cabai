const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;

export function safeCallbackUrl(
  value: string | string[] | undefined,
  fallback = "/dashboard",
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    CONTROL_CHARACTERS.test(raw)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(raw, "https://callback.invalid");
    if (parsed.origin !== "https://callback.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
