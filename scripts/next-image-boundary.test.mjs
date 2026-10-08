import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";

const require = createRequire(import.meta.url);
const dns = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const { fetchExternalImage } = require("next/dist/server/image-optimizer");
const publicAddress = { address: "93.184.215.14", family: 4 };
const image = Buffer.from("synthetic image response");

// Test the installed framework boundary without opening sockets or resolving DNS.
// A dependency downgrade must not silently restore validation-to-fetch DNS rebinding.
function isolate(t, respond) {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unpinned fetch must not be used for remote images");
  });
  for (const transport of [http, https]) {
    t.mock.method(transport, "request", (url, options, callback) => {
      const req = new EventEmitter();
      req.end = () => queueMicrotask(() => {
        try {
          const response = respond(url, options);
          const stream = Readable.from([image]);
          stream.statusCode = response.statusCode ?? 200;
          stream.headers = response.headers ?? { "content-type": "image/png" };
          callback(stream);
        } catch (error) {
          req.emit("error", error);
        }
      });
      return req;
    });
  }
}

for (const protocol of ["http", "https"]) {
  test(`${protocol} image connects using the validated DNS result, not a second lookup`, async (t) => {
    let resolutions = 0;
    const lookup = t.mock.method(dns, "lookup", async () => (
      ++resolutions === 1
        ? [publicAddress]
        : [{ address: "127.0.0.1", family: 4 }]
    ));
    let connected;
    isolate(t, (url, options) => {
      assert.equal(url.hostname, "images.example.invalid");
      assert.equal(typeof options.lookup, "function");
      options.lookup(url.hostname, { all: true }, (error, addresses) => {
        assert.ifError(error);
        connected = addresses;
      });
      assert.deepEqual(connected, [publicAddress]);
      return {};
    });
    const result = await fetchExternalImage(`${protocol}://images.example.invalid/demo.png`, false, 1024);
    assert.deepEqual(result.buffer, image);
    assert.equal(result.contentType, "image/png");
    assert.equal(lookup.mock.callCount(), 1);
  });
}

test("redirect to a private DNS result is rejected before a second request", async (t) => {
  t.mock.method(dns, "lookup", async (hostname) => [
    hostname === "images.example.invalid" ? publicAddress : { address: "127.0.0.1", family: 4 },
  ]);
  let requests = 0;
  isolate(t, () => {
    requests++;
    return { statusCode: 302, headers: { location: "https://internal.example.invalid/image.png" } };
  });
  await assert.rejects(fetchExternalImage("https://images.example.invalid/demo.png", false, 1024),
    (error) => error.statusCode === 400);
  assert.equal(requests, 1);
});

test("private IPv4 and bracketed IPv6 literals never reach a request", async (t) => {
  t.mock.method(dns, "lookup", () => { throw new Error("Literal IP needs no DNS"); });
  let requests = 0;
  isolate(t, () => { requests++; throw new Error("Private IP reached transport"); });
  for (const host of ["127.0.0.1", "[::1]", "[::ffff:127.0.0.1]"]) {
    await assert.rejects(fetchExternalImage(`https://${host}/demo.png`, false, 1024),
      (error) => error.statusCode === 400);
  }
  assert.equal(requests, 0);
});
