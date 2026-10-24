// media.vidyanexa.com: serves uploaded files from the R2 bucket, at Cloudflare's edge, only with a valid signed link.
//
// The API decides who may see a file, then redirects to
//   https://media.vidyanexa.com/<storage key>?exp=<unix time>&d=<0 inline | 1 download>&n=<file name>&sig=<hex>
// where sig = HMAC-SHA256(MEDIA_SIGNING_SECRET, key + "\n" + exp + "\n" + d + "\n" + name). Without a valid, unexpired
// signature nothing is served, so the bucket stays private. Files are cached at the edge (by key and how they're shown),
// so popular ones (a school logo, a class photo) don't go back to R2 each time.
//
// Bindings (wrangler.toml): BUCKET (the R2 bucket), secret MEDIA_SIGNING_SECRET, var ALLOWED_ORIGIN (the website).

const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHex(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The parts of a signed link, or null when it isn't valid (wrong signature, expired, malformed). */
export async function verify(url, secret, now = Math.floor(Date.now() / 1000)) {
  const key = decodeURIComponent(url.pathname.slice(1));
  const exp = url.searchParams.get("exp") ?? "";
  const d = url.searchParams.get("d") ?? "";
  const name = url.searchParams.get("n") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!key || key.includes("..") || !/^\d+$/.test(exp) || !/^[01]$/.test(d) || Number(exp) < now) return null;
  const expected = await hmacHex(secret, `${key}\n${exp}\n${d}\n${name}`);
  return sameHex(sig, expected) ? { key, exp: Number(exp), download: d === "1", name } : null;
}

const INLINE = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/;

function headersFor(object, link, allowedOrigin) {
  const type = object.httpMetadata?.contentType || "application/octet-stream";
  const inline = !link.download && INLINE.test(type);
  const h = new Headers();
  h.set("Content-Type", type);
  h.set("Content-Length", String(object.size));
  h.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(link.name || "file")}`);
  h.set("ETag", object.httpEtag);
  // Only for the person the link was made for, until it expires: browsers keep it, shared caches don't.
  h.set("Cache-Control", `private, max-age=${Math.max(0, Math.min(link.exp - Math.floor(Date.now() / 1000), 86400))}`);
  // A file is never a page: nothing in it can run, even if someone uploads something crafted.
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (allowedOrigin) h.set("Access-Control-Allow-Origin", allowedOrigin);
  return h;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    const url = new URL(request.url);
    const link = await verify(url, env.MEDIA_SIGNING_SECRET);
    if (!link) return new Response("This link has expired or isn't valid. Open the file again from Vidyanexa.", { status: 403 });

    // One cached copy per file and way of showing it; the signature isn't part of the key, but is always checked first.
    const cacheKey = new Request(`${url.origin}/${encodeURIComponent(link.key)}?d=${link.download ? 1 : 0}&n=${encodeURIComponent(link.name)}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set("Cache-Control", `private, max-age=${Math.max(0, Math.min(link.exp - Math.floor(Date.now() / 1000), 86400))}`);
      return new Response(request.method === "HEAD" ? null : hit.body, { status: 200, headers: h });
    }

    const object = await env.BUCKET.get(link.key);
    if (!object) return new Response("File not found", { status: 404 });
    const headers = headersFor(object, link, env.ALLOWED_ORIGIN);
    const response = new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
    if (request.method === "GET") {
      // The edge keeps a day's copy (deleted files drop out within a day, and are unreachable without a fresh link anyway).
      const stored = new Headers(headers);
      stored.set("Cache-Control", "public, max-age=86400");
      ctx.waitUntil(cache.put(cacheKey, new Response(response.clone().body, { status: 200, headers: stored })));
    }
    return response;
  },
};
