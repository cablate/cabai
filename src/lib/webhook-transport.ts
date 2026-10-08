import { request } from "node:https";
import { resolveSafeOutboundUrl } from "./url-safety";

const MAX_RESPONSE_BYTES = 64 * 1024;

/** One HTTPS POST: a single DNS decision, no redirects or reusable sockets. */
export async function postWebhook(
  rawUrl: string,
  options: { headers: Record<string, string>; body: string },
): Promise<{ ok: boolean; status: number; text: string }> {
  const signal = AbortSignal.timeout(10_000);
  const target = await resolveSafeOutboundUrl(rawUrl, signal);
  return new Promise((resolve, reject) => {
    let status: number | undefined;
    const finish = (text: string) => resolve({ ok: status! >= 200 && status! < 300, status: status!, text });
    const fail = (error: Error) => {
      // An HTTP status already received remains authoritative for retry policy.
      if (status !== undefined) finish(`Response body unavailable: ${error.message}`);
      else reject(error);
    };
    const req = request(target.url, {
      method: "POST",
      headers: options.headers,
      signal,
      agent: false,
      rejectUnauthorized: true,
      // Keep URL Host/SNI/certificate identity; only substitute the socket address.
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    }, (response) => {
      status = response.statusCode ?? 0;
      if (status >= 200 && status < 300) {
        finish("");
        response.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > MAX_RESPONSE_BYTES) {
          finish("Response body exceeded 64 KiB; body discarded");
          response.destroy();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", fail);
      response.once("aborted", () => fail(new Error("Webhook response aborted")));
      response.once("end", () => {
        finish(Buffer.concat(chunks).toString("utf8"));
      });
    });
    req.once("error", fail);
    req.end(options.body);
  });
}
