import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSkillArtifactDownload } from "@/lib/services/skill-artifact-service";
import { getPublicSkillProjection } from "@/lib/services/skill-release-service";
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Cookie" };
const fail = (message: string, status: number) => new Response(message, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version } = await params;
  const session = await auth();
  const authenticated = Boolean(session?.user?.id);
  const skill = await getPublicSkillProjection(slug, { authenticated });
  if (!skill.ok) {
    return fail("找不到可下載的 Skill 版本。", skill.kind === "not-found" ? 404 : 503);
  }

  const release = skill.value.releases.find((item) => item.version === version);
  if (!release) return fail("找不到可下載的 Skill 版本。", 404);

  if (release.distribution.mode === "github") {
    const response = NextResponse.redirect(release.distribution.sourceArchiveUrl, 307);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }

  try {
    const result = await createSkillArtifactDownload({ releaseId: release.id, authenticated });
    if (!result.ok) {
      if (result.kind === "forbidden") {
        return fail(authenticated ? "目前帳號無法下載。" : "請先登入再下載。", authenticated ? 403 : 401);
      }
      if (result.kind === "not-found") return fail("找不到可下載的 Skill 版本。", 404);
      return fail("Skill artifact 暫時無法通過驗證，未提供下載。", 503);
    }
    const response = NextResponse.redirect(result.value.url, 307);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  } catch {
    return fail("Skill 下載暫時無法使用。", 503);
  }
}
