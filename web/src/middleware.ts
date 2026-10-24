import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";
import { clientHeaders, refreshTokens } from "@/lib/auth/refresh";

// Marketing site and auth pages: reachable without a session.
const PUBLIC_PAGES = [
  "/", "/pricing", "/about", "/contact", "/privacy", "/terms", "/signup",
  "/login", "/forgot-password", "/reset-password", "/offline",
];
// API calls that are allowed without a session (forwarded through the proxy).
const PUBLIC_API_PREFIXES = ["/api/proxy/auth/password-reset/", "/api/proxy/public/"];
// Public page prefixes (a school's admission form lives at /apply/<school id>).
const PUBLIC_PREFIXES = ["/apply/", "/features"];

function unauthenticated(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const res = isApi
    ? NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not signed in" } }, { status: 401 })
    : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url));
  clearAuthCookies(res);
  return res;
}

// The CDN address (ASSET_PREFIX, e.g. https://cdn.vidyanexa.com) points at this same site but is only for built CSS, JS
// and fonts, which never reach the middleware. Anything else asked of it goes to the real site, so search engines never
// see a second copy of the pages.
const CDN_HOST = process.env.ASSET_PREFIX ? new URL(process.env.ASSET_PREFIX).host : null;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (CDN_HOST && SITE_URL && req.headers.get("host") === CDN_HOST) {
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, SITE_URL), 308);
  }
  if (pathname.startsWith("/api/auth/") || PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    if (pathname === "/login" && access) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (access) return NextResponse.next();
  if (!refresh) return unauthenticated(req);

  // Access cookie expired: refresh, then hand the new token to this same request.
  const tokens = await refreshTokens(refresh, clientHeaders(req.headers));
  if (!tokens) return unauthenticated(req);

  req.cookies.set(ACCESS_COOKIE, tokens.access_token);
  req.cookies.set(REFRESH_COOKIE, tokens.refresh_token);
  const headers = new Headers(req.headers);
  headers.set("cookie", req.cookies.toString());
  const res = NextResponse.next({ request: { headers } });
  setAuthCookies(res, tokens);
  return res;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|brand/|marketing/|og/|icon.png|apple-icon.png|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js).*)"],
};
