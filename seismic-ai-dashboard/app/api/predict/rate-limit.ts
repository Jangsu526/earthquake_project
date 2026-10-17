import "server-only";
import { isIP } from "node:net";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let limiter: Ratelimit | undefined;

function requestIdentifier(request: Request): string | null {
  // Only Vercel's ingress is trusted to supply this header. Never fall back to
  // arbitrary X-Forwarded-For / X-Real-IP supplied by a client.
  if (process.env.VERCEL === "1") {
    const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
    if (!ip || !isIP(ip)) return null;
    // Canonicalize equivalent IPv6 spellings so they share a Redis key.
    const canonical = isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname : ip;
    return `ip:${canonical}`;
  }
  // Local requests cannot supply a trustworthy remote address via Request.
  // All local callers share one bucket; changing headers cannot bypass it.
  if (process.env.NODE_ENV === "development") return "local-development";
  return null;
}

function getLimiter(): Ratelimit {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token || new URL(url).protocol !== "https:") {
    throw new Error("Rate limit configuration unavailable");
  }
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: `seismic-ai:predict:${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"}`,
    ephemeralCache: false,
    analytics: false,
    timeout: 3000,
  });
  return limiter;
}

/** null means allowed; otherwise return this response before reading the body. */
export async function checkPredictionRateLimit(request: Request): Promise<Response | null> {
  try {
    const identifier = requestIdentifier(request);
    if (!identifier) throw new Error("Trusted client address unavailable");
    const result = await getLimiter().limit(identifier);
    // The SDK's timeout response has success=true: explicitly fail closed.
    if (result.reason === "timeout") throw new Error("Rate limit timeout");
    if (!result.success) {
      const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      return Response.json({ error: "요청 횟수를 초과했습니다." }, {
        status: 429,
        headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
      });
    }
    return null;
  } catch {
    // Do not log SDK errors: they can include credentials or Redis URLs.
    return Response.json({ error: "요청 제한 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
