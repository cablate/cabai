import { requireAgent, requireDestructiveConfirmation } from "@/lib/agent-auth";
import { withApiHandler } from "@/lib/api-route";
import { createLogger } from "@/lib/logger";
import { deleteAgentMedia } from "@/lib/services/agent-operations-service";

const logger = createLogger("agent/media");
const handleDelete = withApiHandler<{ params: Promise<{ id: string }> }>({ logger, operation: "delete media" }, async (request, context) => {
  const actor = await requireAgent(request, "media:delete");
  const { id } = await context!.params;
  requireDestructiveConfirmation(request, id);
  const result = await deleteAgentMedia(id, actor);
  if (result.kind === "not-found") return Response.json({ error: "Media not found" }, { status: 404 });
  if (result.kind === "bound") return Response.json({ error: "Cannot delete media that is still bound to an entity. Unbind first by deleting/updating the entity, or wait for it to be auto-orphaned." }, { status: 409 });
  if (result.storageDeleteError) logger.warn("R2 delete failed, continuing to mark deleted in DB", { mediaId: id, storageKey: result.storageKey, error: result.storageDeleteError instanceof Error ? result.storageDeleteError.message : String(result.storageDeleteError) });
  return Response.json({ data: { deleted: true, mediaId: id } });
});
export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return handleDelete(request, context); }
