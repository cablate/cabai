import { requireAgent } from "@/lib/agent-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { getAgentPlanPresentation, upsertAgentPlanPresentation } from "@/lib/services/agent-plan-service";
import { planPresentationUpdateSchema } from "@/lib/agent/plan-schemas";

const logger = createLogger("agent/plans/presentation");
type Context={params:Promise<{id:string}>};
async function handleGet(request:Request,{params}:Context){
  try { await requireAgent(request,"content:read"); const {id}=await params; const result=await getAgentPlanPresentation(id); if(result.kind==="plan-not-found") return Response.json({error:"Plan not found"},{status:404}); return Response.json({data:result.data}); }
  catch(err){if(err instanceof Response)return err;return Response.json({error:"Server error"},{status:500});}
}
async function handlePatch(request:Request,{params}:Context){
  try { const agent=await requireAgent(request,"plan:write"); const {id}=await params; const parsed=planPresentationUpdateSchema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return Response.json({error:"Invalid input",details:parsed.error.flatten().fieldErrors},{status:400}); const result=await upsertAgentPlanPresentation(id,parsed.data,agent); if(result.kind==="plan-not-found")return Response.json({error:"Plan not found"},{status:404}); if(result.kind==="missing-required")return Response.json({error:"offeringType and title are required when creating a presentation"},{status:400}); return Response.json({data:{updated:true,planId:id,id:result.id}}); }
  catch(err){if(err instanceof Response)return err;logger.error("Failed to update presentation",{error:err instanceof Error?err.message:String(err)});return Response.json({error:"Internal server error"},{status:500});}
}
const getPresentation=withApiHandler<Context>({logger,operation:"get plan presentation"},(r,c)=>handleGet(r,c!));
const updatePresentation=withApiHandler<Context>({logger,operation:"update plan presentation"},(r,c)=>handlePatch(r,c!));
export function GET(r:Request,c:Context){return getPresentation(r,c)}
export function PATCH(r:Request,c:Context){return updatePresentation(r,c)}
