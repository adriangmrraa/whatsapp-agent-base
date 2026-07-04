import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Default sliding window: 10 requests per 60 seconds.
 */
const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW = "60 s";

let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit {
  if (!_ratelimit) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        "Rate limiting requires UPSTASH_REDIS_REST_URL and " +
          "UPSTASH_REDIS_REST_TOKEN environment variables to be set",
      );
    }

    const redis = new Redis({ url, token });

    _ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(DEFAULT_LIMIT, DEFAULT_WINDOW),
      analytics: true,
    });
  }

  return _ratelimit;
}

/**
 * Check whether the given identifier has exceeded the rate limit.
 *
 * @param identifier - A unique key (e.g. IP address, user ID, or route path).
 * @returns An object with `success` (true if the request is allowed),
 *          `remaining` (how many requests are left in the window), and
 *          `limit` (the maximum requests per window).
 */
export async function checkRateLimit(
  identifier: string,
): Promise<{ success: boolean; remaining: number; limit: number }> {
  const ratelimit = getRatelimit();
  const result = await ratelimit.limit(identifier);

  return {
    success: result.success,
    remaining: result.remaining,
    limit: result.limit,
  };
}

/**
 * Build standard rate-limit HTTP response headers.
 *
 * @param success - Whether the request passed the rate limit check.
 * @param remaining - Remaining requests in the current window.
 * @param limit - Maximum requests per window.
 * @returns A record of header name/value pairs.
 */
export function getRateLimitHeaders(
  success: boolean,
  remaining: number,
  limit: number,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": success ? "0" : "1",
  };
}
