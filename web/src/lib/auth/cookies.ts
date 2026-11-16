import type { NextResponse } from "next/server";
import type { TokenPair } from "@/lib/api/types";

/** Tokens live only in httpOnly cookies; browser JavaScript never sees them. */
export const ACCESS_COOKIE = "ev_at";
export const REFRESH_COOKIE = "ev_rt";
/** A harmless "this browser is signed in" hint the public pages read in the browser (no token, nothing secret), so those
 *  pages never read cookies on the server and can be cached on the CDN. Set and cleared with the real cookies. */
export const SIGNED_IN_HINT = "ev_in";

// Secure (HTTPS-only) cookies in production. COOKIE_SECURE=false allows a plain-HTTP trial on a server IP; never use that for real data.
const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
// Expire the access cookie a minute early so the middleware refreshes before the API rejects it.
const EARLY_SECONDS = 60;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export function setAuthCookies(res: NextResponse, tokens: TokenPair) {
  res.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true, secure, sameSite: "lax", path: "/",
    maxAge: Math.max(tokens.expires_in - EARLY_SECONDS, 30),
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: REFRESH_MAX_AGE,
  });
  res.cookies.set(SIGNED_IN_HINT, "1", { httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: REFRESH_MAX_AGE });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(SIGNED_IN_HINT, "", { path: "/", maxAge: 0 });
}
