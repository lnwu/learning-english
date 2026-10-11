import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { setBounded } from "@/lib/boundedMap";
import { createLogger, nowMs } from "@/lib/log";
import { getRedis } from "@/lib/redis";

const log = createLogger({ mod: "ratelimit" });

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

  const startedAt = nowMs();
  try {
    const { success } = await limiter.limit(key);
    log.debug("cache.lookup", "Rate limit checked", {
      layer: "ratelimit",
      durationMs: Math.round(nowMs() - startedAt),
    });
    return success ? null : tooManyRequests();
  } catch (error) {
    log.warn(
      "rate_limit.degraded",
      "Rate limit backend failed, falling back to in-memory",
      { degraded: true, durationMs: Math.round(nowMs() - startedAt) },
      error,
    );
    return checkInMemoryRateLimit(key, limit, windowMs);
  }
}
