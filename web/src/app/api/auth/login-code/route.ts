import { NextResponse, type NextRequest } from "next/server";
import { setAuthCookies } from "@/lib/auth/cookies";
import { apiCall, clientHeaders } from "@/lib/auth/refresh";
import type { ApiEnvelope, Me, TokenPair } from "@/lib/api/types";

/** Sign in with a one-time code. Like /api/auth/login, the tokens go into httpOnly cookies. */
export async function POST(req: NextRequest) {
  const res = await apiCall<ApiEnvelope<{ tokens: TokenPair; user: Me }>>("/api/v1/auth/login-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": req.headers.get("user-agent") ?? "",
      ...clientHeaders(req.headers),
    },
    body: await req.text(),
  });
  if (!res.ok) return NextResponse.json(res.payload, { status: res.status });
  const payload = res.payload;
  const out = NextResponse.json({ success: true, data: { user: payload.data.user } });
  setAuthCookies(out, payload.data.tokens);
  return out;
}
