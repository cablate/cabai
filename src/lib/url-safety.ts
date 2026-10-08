import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export class UnsafeOutboundUrlError extends Error {}

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedV4.addSubnet(network, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) blockedV6.addSubnet(network, prefix, "ipv6");

/** Fail closed for non-global, invalid, mapped and transition addresses. */
export function isPrivateAddress(address: string): boolean {
  const host = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  const family = isIP(host);
  if (family === 4) return blockedV4.check(host, "ipv4");
  if (family === 6) return !globalV6.check(host, "ipv6") || blockedV6.check(host, "ipv6");
  return true;
}

export async function resolveSafeOutboundUrl(rawUrl: string, signal = AbortSignal.timeout(10_000)) {
  let url: URL;
  try { url = new URL(rawUrl); }
  catch { throw new UnsafeOutboundUrlError("Invalid URL"); }
  if (url.protocol !== "https:") throw new UnsafeOutboundUrlError("URL must use https://");
  if (url.username || url.password || url.hash) throw new UnsafeOutboundUrlError("URL credentials and fragments are not supported");
  signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  let addresses: Array<{ address: string; family: number }>;
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    let onAbort: (() => void) | undefined;
    try {
      addresses = await Promise.race([
        lookup(hostname, { all: true }),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
        }),
      ]);
    } catch {
      signal.throwIfAborted();
      throw new UnsafeOutboundUrlError("Webhook hostname does not resolve");
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address, family }) =>
    isIP(address) !== family || isPrivateAddress(address))) {
    throw new UnsafeOutboundUrlError("Webhook URL resolves to a non-public address");
  }
  return { url, hostname, address: addresses[0]!.address, family: addresses[0]!.family };
}

/** Configuration validation only. Runtime must use the pinned HTTPS transport. */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  await resolveSafeOutboundUrl(rawUrl);
}
