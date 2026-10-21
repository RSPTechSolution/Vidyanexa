import { NextResponse, type NextRequest } from "next/server";
import { apiCall, clientHeaders } from "@/lib/auth/refresh";

/** Ask the API to send a sign-in code by email or SMS. */
export async function POST(req: NextRequest) {
  const res = await apiCall("/api/v1/auth/login-code/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...clientHeaders(req.headers) },
    body: await req.text(),
  });
  return NextResponse.json(res.payload, { status: res.status });
}
