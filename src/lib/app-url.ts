const FALLBACK_APP_URL = "http://localhost:3002";

export function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    FALLBACK_APP_URL;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return FALLBACK_APP_URL;
    }
    return url.origin;
  } catch {
    return FALLBACK_APP_URL;
  }
}

export function appUrl(path = "/"): string {
  const base = getAppBaseUrl();
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
