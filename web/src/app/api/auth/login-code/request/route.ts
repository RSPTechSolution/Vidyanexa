import { NextResponse, type NextRequest } from "next/server";
import { API_URL, clientHeaders } from "@/lib/auth/refresh";

/** Ask the API to send a sign-in code by email or SMS. */
export async function POST(req: NextRequest) {
  const res = await fetch(`${API_URL}/api/v1/auth/login-code/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...clientHeaders(req.headers),
    },
    body: await req.text(),
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
