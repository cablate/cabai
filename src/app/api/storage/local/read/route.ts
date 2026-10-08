import { requireLocalStorageProvider } from "@/lib/storage";

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return Response.json({ error: "Asset not found" }, { status: 404 });
  try {
    return await requireLocalStorageProvider().readFromToken(token);
  } catch {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
}
