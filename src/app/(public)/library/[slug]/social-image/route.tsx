import { ImageResponse } from "next/og";
import { getPublishedLibraryEntry } from "@/lib/services/library-service";
import { BRAND_NAME } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ slug: string }>;
  },
) {
  const { slug } = await params;
  const result = await getPublishedLibraryEntry(slug);
  if (!result.ok) {
    return new Response("Library entry not found", { status: 404 });
  }

  const tags = result.value.tags.slice(0, 3);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f6f2e9",
          color: "#17211b",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
          }}
        >
          <span style={{ fontWeight: 700 }}>{BRAND_NAME} Library</span>
          <span style={{ color: "#52645a" }}>Knowledge Hub</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              maxWidth: 1020,
              fontSize: result.value.title.length > 28 ? 54 : 64,
              fontWeight: 700,
              lineHeight: 1.16,
              letterSpacing: "-0.03em",
            }}
          >
            {result.value.title}
          </div>
          <div
            style={{
              maxWidth: 980,
              color: "#52645a",
              fontSize: 28,
              lineHeight: 1.45,
            }}
          >
            {result.value.summary}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 22, color: "#315f48" }}>
          {tags.length > 0
            ? tags.map((tag) => <span key={tag}>#{tag}</span>)
            : <span>Library</span>}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
