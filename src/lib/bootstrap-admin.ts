export interface BootstrapAdminOptions { email: string; allowAdditionalAdmin: boolean }

export function parseBootstrapAdminArgs(args: string[]): BootstrapAdminOptions {
  const allowAdditionalAdmin = args.includes("--allow-additional-admin");
  const email = args.filter((arg) => !arg.startsWith("--"))[0]?.trim().toLowerCase() ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email address is required.");
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--allow-additional-admin");
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  return { email, allowAdditionalAdmin };
}
