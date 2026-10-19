import { NextResponse, type NextRequest } from "next/server";
import { setAuthCookies } from "@/lib/auth/cookies";
import { API_URL, clientHeaders } from "@/lib/auth/refresh";
import type { ApiEnvelope, Me, TokenPair } from "@/lib/api/types";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": req.headers.get("user-agent") ?? "",
      ...clientHeaders(req.headers),
    },
    body,
    cache: "no-store",
  });
  const payload = (await res.json()) as ApiEnvelope<{ tokens: TokenPair; user: Me }>;
  if (!res.ok) return NextResponse.json(payload, { status: res.status });

  // Tokens go into httpOnly cookies; only the user profile is returned to the browser.
  const out = NextResponse.json({ success: true, data: { user: payload.data.user } });
  setAuthCookies(out, payload.data.tokens);
  return out;
}
