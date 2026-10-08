import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { isPrivateMediaContext } from "@/lib/media-assets";
import { requireLocalStorageProvider } from "@/lib/storage";
import { assertStorageKey } from "@/lib/storage/validation";
import { uploadContextSchema } from "@/lib/upload-validation";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  try {
    const encodedKey = (await params).key;
    const storageKey = Buffer.from(encodedKey, "base64url").toString("utf8");
    // Only accept the exact representation emitted by publicUrl().
    if (!encodedKey || Buffer.from(storageKey).toString("base64url") !== encodedKey) throw new Error("Invalid storage key encoding");
    assertStorageKey(storageKey);

    const record = await db.query.media.findFirst({
      where: eq(media.storageKey, storageKey),
      columns: { context: true, status: true },
    });
    // A known key (including one disclosed in a private token) is not authority.
    // Pending public uploads remain readable for the existing editor preview.
    if (!record
      || !uploadContextSchema.safeParse(record.context).success
      || isPrivateMediaContext(record.context)
      || (record.status !== "pending" && record.status !== "confirmed")) {
      return Response.json({ error: "Asset not found" }, { status: 404 });
    }
    return await requireLocalStorageProvider().readPublic(encodedKey);
  } catch {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
}
