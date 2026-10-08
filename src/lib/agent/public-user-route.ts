import { validateUserToken } from "@/lib/user-auth";

/**
 * Public routes stay anonymous even when a valid user credential is supplied.
 * Supplying any invalid credential is an authentication error, never a signal
 * to retry the request anonymously.
 */
export async function rejectInvalidSuppliedPublicCredential(request: Request): Promise<void> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return;

  const valid = await validateUserToken(authorization);
  if (valid) return;

  throw new Response(
    JSON.stringify({ error: "Invalid, revoked, or expired token" }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}
