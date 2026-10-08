import { normalizeAttributionProperties, type Attribution } from "@/lib/attribution";

export const CLIENT_TRACK_EVENTS = [
  "page_view",
  "product_cta_clicked",
  "community_viewed",
  "community_cta_clicked",
  "resource_opened",
  "resource_downloaded",
] as const;

export type ClientTrackEvent = (typeof CLIENT_TRACK_EVENTS)[number];

export interface ParsedTrackEvent {
  event: ClientTrackEvent;
  properties: Record<string, string> & Attribution;
}

function safeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function pick(
  record: Record<string, unknown>,
  fields: ReadonlyArray<readonly [string, number]>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, maxLength] of fields) {
    const value = safeString(record[key], maxLength);
    if (value) result[key] = value;
  }
  return result;
}

export function parseTrackEvent(input: unknown): ParsedTrackEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (!CLIENT_TRACK_EVENTS.includes(body.event as ClientTrackEvent)) return null;

  const event = body.event as ClientTrackEvent;
  const sourceProperties =
    body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
      ? (body.properties as Record<string, unknown>)
      : {};
  const attribution = normalizeAttributionProperties(sourceProperties);
  let properties: Record<string, string> = {};

  if (event === "page_view") {
    const path = safeString(sourceProperties.path, 500);
    if (!path || !path.startsWith("/") || path.includes("?")) return null;
    properties = { path };
  } else if (event === "product_cta_clicked") {
    properties = pick(sourceProperties, [["planId", 128]]);
    if (!properties.planId) return null;
    if (sourceProperties.type === "internal" || sourceProperties.type === "external") {
      properties.type = sourceProperties.type;
    }
  } else if (event === "community_cta_clicked") {
    if (sourceProperties.destination === "discord" || sourceProperties.destination === "products") {
      properties.destination = sourceProperties.destination;
    }
  } else if (event === "resource_opened" || event === "resource_downloaded") {
    properties = pick(sourceProperties, [
      ["resourceId", 128],
      ["resourceType", 64],
      ["resourceTitle", 200],
    ]);
    if (!properties.resourceId || !properties.resourceType) return null;
  }

  return { event, properties: { ...properties, ...attribution } };
}
