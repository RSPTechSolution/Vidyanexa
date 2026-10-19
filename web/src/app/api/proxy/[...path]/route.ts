import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { API_URL, clientHeaders } from "@/lib/auth/refresh";

/** Browser -> Next -> FastAPI. Adds the bearer token from the httpOnly cookie.
 *  The middleware has already refreshed an expired token before we get here. */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;

  // CSRF defence in depth (cookies are SameSite=Lax already): mutating requests
  // must come from our own origin.
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Cross-origin request blocked" } }, { status: 403 });
    }
  }

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const headers: Record<string, string> = {};
  for (const h of ["content-type", "accept", "user-agent"]) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  Object.assign(headers, clientHeaders(req.headers));
  if (token) headers.authorization = `Bearer ${token}`;

  const url = `${API_URL}/api/v1/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  });

  const out = new NextResponse(upstream.body, { status: upstream.status });
  for (const h of ["content-type", "content-disposition", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v) out.headers.set(h, v);
  }
  return out;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
