export const ATTRIBUTION_STORAGE_KEY = "cabai.attribution.v1";
export const ATTRIBUTION_TTL_MS = 30 * 60 * 1000;

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
}

interface StoredAttribution {
  values: Attribution;
  expiresAt: number;
}

const INPUT_KEYS = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
} as const;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

function normalizeValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.normalize("NFC").replace(CONTROL_CHARACTERS, "").trim().slice(0, 100);
  return normalized || undefined;
}

export function normalizeAttribution(input: URLSearchParams): Attribution {
  const result: Attribution = {};
  for (const [inputKey, outputKey] of Object.entries(INPUT_KEYS)) {
    const value = normalizeValue(input.get(inputKey));
    if (value) result[outputKey as keyof Attribution] = value;
  }
  return result;
}

export function normalizeAttributionProperties(input: unknown): Attribution {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  const result: Attribution = {};
  for (const key of ["source", "medium", "campaign"] as const) {
    const value = typeof record[key] === "string" ? normalizeValue(record[key]) : undefined;
    if (value) result[key] = value;
  }
  return result;
}

export function hasAttribution(value: Attribution): boolean {
  return Boolean(value.source || value.medium || value.campaign);
}

export function captureAttribution(
  searchParams: URLSearchParams,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  now = Date.now(),
): Attribution {
  const values = normalizeAttribution(searchParams);
  if (hasAttribution(values)) {
    const stored: StoredAttribution = { values, expiresAt: now + ATTRIBUTION_TTL_MS };
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(stored));
    return values;
  }
  return readAttribution(storage, now);
}

export function readAttribution(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): Attribution {
  const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
  if (!raw) return {};
  try {
    const stored = JSON.parse(raw) as Partial<StoredAttribution>;
    if (typeof stored.expiresAt !== "number" || stored.expiresAt <= now) {
      storage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return {};
    }
    return normalizeAttributionProperties(stored.values);
  } catch {
    storage.removeItem(ATTRIBUTION_STORAGE_KEY);
    return {};
  }
}
