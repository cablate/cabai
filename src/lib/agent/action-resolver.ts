import { buildAgentOpenApi } from "@/lib/agent/openapi";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "options" | "head" | "trace";

export interface ResolvedAgentOperation {
  operationId: string;
  method: HttpMethod;
  path: string;
  credential: "none" | "user" | "agent";
  requiredScope: string | null;
  parameters: Array<{ name: string; in: string; required: boolean }>;
}

const methods = new Set<HttpMethod>(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);

function credentialFromSecurity(security: unknown): ResolvedAgentOperation["credential"] {
  if (!Array.isArray(security) || security.length === 0) return "none";
  for (const entry of security) {
    if (entry && typeof entry === "object") {
      if ("userKey" in entry) return "user";
      if ("agentKey" in entry) return "agent";
    }
  }
  return "none";
}

export function listAgentOperations(): ResolvedAgentOperation[] {
  const document = buildAgentOpenApi();
  const resolved: ResolvedAgentOperation[] = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!methods.has(method as HttpMethod) || !rawOperation || typeof rawOperation !== "object") continue;
      const operation = rawOperation as Record<string, unknown>;
      if (typeof operation.operationId !== "string") continue;
      const parameters = Array.isArray(operation.parameters)
        ? operation.parameters.flatMap((parameter) => {
            if (!parameter || typeof parameter !== "object" || !("name" in parameter)) return [];
            const value = parameter as Record<string, unknown>;
            return typeof value.name === "string" && typeof value.in === "string"
              ? [{ name: value.name, in: value.in, required: value.required === true }]
              : [];
          })
        : [];
      resolved.push({
        operationId: operation.operationId,
        method: method as HttpMethod,
        path,
        credential: credentialFromSecurity(operation.security),
        requiredScope: typeof operation["x-required-scope"] === "string"
          ? operation["x-required-scope"]
          : null,
        parameters,
      });
    }
  }

  return resolved;
}

export function resolveAgentOperation(operationId: string): ResolvedAgentOperation | null {
  return listAgentOperations().find((operation) => operation.operationId === operationId) ?? null;
}

export function findAgentOperation(criteria: {
  method: HttpMethod;
  path: string;
  credential?: ResolvedAgentOperation["credential"];
}): ResolvedAgentOperation | null {
  return listAgentOperations().find((operation) => (
    operation.method === criteria.method
    && operation.path === criteria.path
    && (criteria.credential === undefined || operation.credential === criteria.credential)
  )) ?? null;
}

export function resolveInformationActionOperation(operationId: string): ResolvedAgentOperation | null {
  const operation = resolveAgentOperation(operationId);
  if (!operation || operation.credential === "agent") return null;
  return operation;
}

export function validateActionParameters(
  operation: ResolvedAgentOperation,
  parameters: Record<string, string | number | boolean>,
): boolean {
  const allowed = new Set(operation.parameters.map((parameter) => parameter.name));
  const required = operation.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name);
  return Object.keys(parameters).every((name) => allowed.has(name))
    && required.every((name) => Object.hasOwn(parameters, name));
}
