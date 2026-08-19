import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 5000;
const buckets = new Map<string, Bucket>();

function evictExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkInMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) evictExpiredBuckets(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return tooManyRequests();
  }
  return null;
}

function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: "请求过于频繁，请稍后再试" },
    { status: 429 }
  );
}

interface RedisConfig {
  url: string;
  token: string;
}

function getRedisConfig(): RedisConfig | null {
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowMs: number): Ratelimit | null {
  const config = getRedisConfig();
  if (!config) return null;

  if (!redis) {
    redis = new Redis(config);
  }

  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
      prefix: "ratelimit",
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  const limiter = getLimiter(limit, windowMs);
  if (!limiter) {
    return checkInMemoryRateLimit(key, limit, windowMs);
  }

  try {
    const { success } = await limiter.limit(key);
    return success ? null : tooManyRequests();
  } catch (error) {
    console.error("Upstash rate limit failed, falling back to in-memory:", error);
    return checkInMemoryRateLimit(key, limit, windowMs);
  }
}
