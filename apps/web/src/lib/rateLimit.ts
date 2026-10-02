import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { setBounded } from "@/lib/boundedMap";
import { getRedis } from "@/lib/redis";

interface Bucket {
  count: number;
  resetAt: number;
}

export const MAX_BUCKETS = 5000;
const buckets = new Map<string, Bucket>();

export function checkInMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (bucket) buckets.delete(key);
    setBounded(
      buckets,
      key,
      { count: 1, resetAt: now + windowMs },
      MAX_BUCKETS,
      (entry) => entry.resetAt <= now,
    );
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return tooManyRequests();
  }
  return null;
}

function tooManyRequests(): NextResponse {
  return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowMs: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

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
  windowMs: number,
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
