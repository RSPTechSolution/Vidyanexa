import { NextResponse, type NextRequest } from "next/server";
import { setAuthCookies } from "@/lib/auth/cookies";
import { apiCall, clientHeaders } from "@/lib/auth/refresh";
import type { ApiEnvelope, Me, TokenPair } from "@/lib/api/types";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await apiCall<ApiEnvelope<{ tokens: TokenPair; user: Me }>>("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": req.headers.get("user-agent") ?? "",
      ...clientHeaders(req.headers),
    },
    body,
  });
  if (!res.ok) return NextResponse.json(res.payload, { status: res.status });
  const payload = res.payload;

  // Tokens go into httpOnly cookies; only the user profile is returned to the browser.
  const out = NextResponse.json({ success: true, data: { user: payload.data.user } });
  setAuthCookies(out, payload.data.tokens);
  return out;
}
