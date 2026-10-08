import { requireLocalStorageProvider } from "@/lib/storage";

export async function PUT(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return Response.json({ error: "Invalid upload target" }, { status: 401 });
  try {
    await requireLocalStorageProvider().storeUpload(token, request);
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Invalid upload target" }, { status: 401 });
  }
}
