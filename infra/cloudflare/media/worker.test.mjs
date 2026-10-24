// node --test infra/cloudflare/media/worker.test.mjs
// Checks the Worker against the API's signing (a link the API made must open; anything changed must not), and that it
// serves from the bucket with safe headers and caches at the edge.
import assert from "node:assert/strict";
import test from "node:test";
import worker, { verify } from "./worker.js";

const SECRET = "test-secret";
// Made by the API's storage_service.media_url for this key, name and expiry (see api/tests/test_media_links.py).
const SIGNED = "https://media.vidyanexa.com/abc/student_photo/x%20y.webp?exp=1999994400&d=0&n=Aarav%20Patel.webp&sig=3d5d832ef35513c3679dc75b0b3b31122aef3c78ac39f8c474bbae45e60d7e69";
const BEFORE = 1999990000;

test("a link signed by the API is accepted", async () => {
  const link = await verify(new URL(SIGNED), SECRET, BEFORE);
  assert.deepEqual(link, { key: "abc/student_photo/x y.webp", exp: 1999994400, download: false, name: "Aarav Patel.webp" });
});

test("changing any part of the link, a wrong secret, or an expired link is refused", async () => {
  for (const [from, to] of [["x%20y.webp", "other.webp"], ["d=0", "d=1"], ["exp=1999994400", "exp=1999999999"], ["Aarav%20Patel", "Someone"], ["sig=3d5d", "sig=4d5d"]]) {
    assert.equal(await verify(new URL(SIGNED.replace(from, to)), SECRET, BEFORE), null, `changed ${from}`);
  }
  assert.equal(await verify(new URL(SIGNED), "another-secret", BEFORE), null);
  assert.equal(await verify(new URL(SIGNED), SECRET, 1999994401), null); // expired
  assert.equal(await verify(new URL(SIGNED.replace("abc/", "../")), SECRET, BEFORE), null);
});

function env(objects) {
  return {
    MEDIA_SIGNING_SECRET: SECRET,
    ALLOWED_ORIGIN: "https://www.vidyanexa.com",
    BUCKET: { get: async (key) => (key in objects ? { body: objects[key].body, size: objects[key].body.length, httpEtag: '"e1"', httpMetadata: { contentType: objects[key].type } } : null) },
  };
}

function edgeCache() {
  const store = new Map();
  globalThis.caches = { default: { match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => void store.set(r.url, res) } };
  return store;
}

test("serves the file inline with safe headers, and keeps an edge copy", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: BEFORE * 1000 });
  const store = edgeCache();
  const waits = [];
  const res = await worker.fetch(new Request(SIGNED), env({ "abc/student_photo/x y.webp": { body: "IMAGEDATA", type: "image/webp" } }), { waitUntil: (p) => waits.push(p) });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "IMAGEDATA");
  assert.equal(res.headers.get("Content-Type"), "image/webp");
  assert.match(res.headers.get("Content-Disposition"), /^inline; filename\*=UTF-8''Aarav%20Patel\.webp$/);
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(res.headers.get("Content-Security-Policy"), /sandbox/);
  assert.match(res.headers.get("Cache-Control"), /^private, max-age=\d+$/);
  await Promise.all(waits);
  assert.equal(store.size, 1);

  // The next request is answered from the edge, without the bucket.
  const again = await worker.fetch(new Request(SIGNED), env({}), { waitUntil: () => {} });
  assert.equal(again.status, 200);
  assert.equal(await again.text(), "IMAGEDATA");
});

test("refuses unsigned requests and anything but GET or HEAD; a missing file is a 404", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: BEFORE * 1000 });
  edgeCache();
  const ctx = { waitUntil: () => {} };
  assert.equal((await worker.fetch(new Request("https://media.vidyanexa.com/abc/student_photo/x%20y.webp"), env({}), ctx)).status, 403);
  assert.equal((await worker.fetch(new Request(SIGNED, { method: "POST", body: "x" }), env({}), ctx)).status, 405);
  assert.equal((await worker.fetch(new Request(SIGNED), env({}), ctx)).status, 404);
});
