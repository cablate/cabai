import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { collectRequireAgentMethods, compareRouteParity } from "./agent-route-parity.mjs";

const root = process.cwd();
const userPluginPath = path.join(root, "plugins", "cabai");
const adminPluginPath = path.join(root, "plugins", "cabai-admin");
const userPluginSkillPath = path.join(userPluginPath, "skills", "cabai", "SKILL.md");
const adminPluginSkillPath = path.join(adminPluginPath, "skills", "cabai-admin", "SKILL.md");
const specPath = path.join(root, "docs", "openapi", "agent-v1.json");

const [
  userPluginSkill,
  adminPluginSkill,
  userManifestText,
  adminManifestText,
  userPortableManifestText,
  adminPortableManifestText,
  specText,
] = await Promise.all([
  readFile(userPluginSkillPath, "utf8"),
  readFile(adminPluginSkillPath, "utf8"),
  readFile(path.join(userPluginPath, ".codex-plugin", "plugin.json"), "utf8"),
  readFile(path.join(adminPluginPath, ".codex-plugin", "plugin.json"), "utf8"),
  readFile(path.join(userPluginPath, "plugin.json"), "utf8"),
  readFile(path.join(adminPluginPath, "plugin.json"), "utf8"),
  readFile(specPath, "utf8"),
]);
const userManifest = JSON.parse(userManifestText);
const adminManifest = JSON.parse(adminManifestText);
const userPortableManifest = JSON.parse(userPortableManifestText);
const adminPortableManifest = JSON.parse(adminPortableManifestText);
const spec = JSON.parse(specText);

if (!adminPluginSkill.includes("/api/agent/openapi.yaml")) {
  throw new Error("Agent API skill must use the live OpenAPI discovery endpoint.");
}
if (adminPluginSkill.includes("完整 endpoint 規格 | 要打具體 API 時")) {
  throw new Error("Agent API skill still treats the handwritten contract as canonical.");
}

if (userManifest.name !== "cabai" || adminManifest.name !== "cabai-admin") {
  throw new Error("CabAI plugin manifest names must match their plugin directories.");
}
for (const [label, portable, compatibility] of [
  ["CabAI", userPortableManifest, userManifest],
  ["CabAI Admin", adminPortableManifest, adminManifest],
]) {
  if (
    portable.name !== compatibility.name
    || portable.version !== compatibility.version
    || portable.description !== compatibility.description
  ) {
    throw new Error(`${label} portable and compatibility manifest identity must stay aligned.`);
  }
}
if ("repository" in userManifest || "repository" in userPortableManifest) {
  throw new Error("The public CabAI download must not embed an unapproved repository destination.");
}
if (
  !userPluginSkill.includes("/api/agent/user/v1/openapi.yaml")
  || !userPluginSkill.includes("CABAI_USER_TOKEN")
  || !userPluginSkill.includes("cab_user_*")
) {
  throw new Error("CabAI user plugin must use the User OpenAPI and cab_user_* credential boundary.");
}
if (
  !userPluginSkill.includes("Do not load `/api/agent/openapi.yaml`")
  || !userPluginSkill.includes("must not create, update, publish, withdraw, delete")
) {
  throw new Error("CabAI user plugin must explicitly reject the Admin contract and mutation plane.");
}
if (
  !adminPluginSkill.includes("/api/agent/openapi.yaml")
  || !adminPluginSkill.includes("CABAI_ADMIN_TOKEN")
  || !adminPluginSkill.includes("cab_agent_*")
) {
  throw new Error("CabAI Admin plugin must use the Admin OpenAPI and cab_agent_* credential boundary.");
}
if (
  !adminPluginSkill.includes("Do not substitute `CABAI_USER_TOKEN`")
  || !adminPluginSkill.includes("Use only scopes actually granted")
) {
  throw new Error("CabAI Admin plugin must reject User credentials and preserve explicit scope checks.");
}

const operationIds = new Set(
  Object.values(spec.paths ?? {}).flatMap((pathItem) =>
    Object.values(pathItem ?? {})
      .map((operation) => operation?.operationId)
      .filter(Boolean),
  ),
);
const requiredPlanOperations = [
  "listPlans",
  "createPlan",
  "updatePlan",
  "deletePlan",
  "bindCourseToPlan",
  "unbindCourseFromPlan",
  "listPlanContents",
  "createPlanContent",
  "updatePlanContent",
  "deletePlanContent",
  "listPlanServices",
  "createPlanService",
  "updatePlanService",
  "deletePlanService",
  "restorePlanService",
  "getPlanPresentation",
  "updatePlanPresentation",
  "publishPlanPresentation",
  "unpublishPlanPresentation",
];
const requiredWp04Operations = [
  "listLibraryEntries",
  "createLibraryEntry",
  "getLibraryEntry",
  "updateLibraryEntry",
  "checkLibraryEntryReadiness",
  "publishLibraryEntryBundle",
  "withdrawLibraryEntry",
  "listSkills",
  "createSkill",
  "getSkill",
  "updateSkill",
  "checkSkillReadiness",
  "publishSkillBundle",
  "withdrawSkill",
  "listSkillReleases",
  "createSkillRelease",
  "getSkillRelease",
  "updateSkillRelease",
  "checkSkillReleaseReadiness",
  "publishSkillReleaseBundle",
  "deprecateSkillRelease",
  "withdrawSkillRelease",
  "listInformation",
  "createInformationDraft",
  "prepareInformationDraftFromSource",
  "getInformationCoverage",
  "getInformation",
  "updateInformationDraft",
  "checkInformationReadiness",
  "publishInformation",
  "withdrawInformation",
  "getInformationHistory",
  "getInformationStats",
];
const requiredWp05Operations = [
  "listPublicLibraryEntries",
  "getPublicLibraryEntry",
  "listPublicSkills",
  "getPublicSkill",
  "getPublicSkillRelease",
  "downloadPublicSkillRelease",
  "getUserSkillRelease",
  "downloadUserSkillRelease",
  "listUnreadInformation",
  "acknowledgeInformation",
];
const requiredMediaOperations = [
  "getAdminOpenApi",
  "createMediaUploadTarget",
  "confirmMediaUpload",
  "listMedia",
];
const missing = [...requiredPlanOperations, ...requiredWp04Operations, ...requiredWp05Operations, ...requiredMediaOperations]
  .filter((operationId) => !operationIds.has(operationId));
if (missing.length > 0) {
  throw new Error(`Agent OpenAPI is missing required operations: ${missing.join(", ")}`);
}

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name === "route.ts" ? [fullPath] : [];
  }));
  return nested.flat();
}

const apiRouteRoot = path.join(root, "src", "app", "api");
const documentedMethods = new Set(
  Object.entries(spec.paths ?? {}).flatMap(([apiPath, pathItem]) =>
    Object.entries(pathItem ?? {})
      .filter(([method, operation]) => {
        const security = operation?.security;
        return ["get", "post", "put", "patch", "delete"].includes(method)
          && Array.isArray(security)
          && security.some((requirement) => Object.hasOwn(requirement, "agentKey"));
      })
      .map(([method]) => `${method.toUpperCase()} ${apiPath}`),
  ),
);
const routePaths = await routeFiles(apiRouteRoot);
const routeSources = await Promise.all(routePaths.map(async (routePath) => {
  const relative = path.relative(apiRouteRoot, path.dirname(routePath)).replaceAll("\\", "/");
  const routeSegments = relative === "." ? "" : relative.replace(/\[([^\]]+)\]/g, "{$1}");
  return {
    apiPath: `/api/${routeSegments}`.replace(/\/$/, ""),
    source: await readFile(routePath, "utf8"),
  };
}));
const implementedMethods = collectRequireAgentMethods(routeSources);
const { undocumented, stale } = compareRouteParity(implementedMethods, documentedMethods);
if (undocumented.length > 0 || stale.length > 0) {
  throw new Error([
    undocumented.length > 0 ? `Undocumented requireAgent routes: ${undocumented.join(", ")}` : "",
    stale.length > 0 ? `OpenAPI Agent-auth routes without requireAgent consumers: ${stale.join(", ")}` : "",
  ].filter(Boolean).join("\n"));
}

console.log(`Agent skill and plugin boundary guard passed (${operationIds.size} operations; ${implementedMethods.size} requireAgent consumers documented).`);
