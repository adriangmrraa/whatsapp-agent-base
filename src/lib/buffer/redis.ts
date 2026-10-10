import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis: Redis | null =
  url && token && url.startsWith("https://")
    ? new Redis({ url, token })
    : null;

if (!redis) {
  console.warn(
    "[buffer] UPSTASH_REDIS not configured — using in-memory fallback (single instance only)",
  );
}
