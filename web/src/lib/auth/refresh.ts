import type { ApiEnvelope, TokenPair } from "@/lib/api/types";

export const API_URL = process.env.API_URL ?? "http://localhost:8000";

/** Who the visitor is, for the API's sign-in limits and audit log. When the website and API run on different servers
 *  the API sees only the website's address, so the visitor's goes along with a secret the API checks (WEB_PROXY_SECRET
 *  on both). The host (e.g. Vercel) sets x-real-ip / x-forwarded-for itself, so visitors can't fake them. */
export function clientHeaders(h: Headers): Record<string, string> {
  const forwarded = h.get("x-forwarded-for");
  const ip = h.get("x-real-ip") ?? forwarded?.split(",")[0]?.trim();
  const secret = process.env.WEB_PROXY_SECRET;
  return {
    ...(forwarded ? { "X-Forwarded-For": forwarded } : {}),
    ...(ip && secret ? { "X-Client-IP": ip, "X-Web-Secret": secret } : {}),
  };
}

/** Shared by middleware and route handlers. Concurrent refreshes with the same
 *  token share one request, because the API rotates refresh tokens on use and
 *  would treat a second use as token theft. */
const inflight = new Map<string, Promise<TokenPair | null>>();

export function refreshTokens(refreshToken: string, client: Record<string, string> = {}): Promise<TokenPair | null> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;
  const p = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...client },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });
      if (!res.ok) return null;
      return ((await res.json()) as ApiEnvelope<TokenPair>).data;
    } catch {
      return null;
    }
  })();
  inflight.set(refreshToken, p);
  // Keep the result briefly so requests that arrive just after still share it.
  p.finally(() => setTimeout(() => inflight.delete(refreshToken), 10_000));
  return p;
}
