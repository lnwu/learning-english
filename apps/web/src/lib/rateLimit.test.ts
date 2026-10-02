import { describe, it, expect, afterEach, jest } from "bun:test";
import { MAX_BUCKETS, checkRateLimit, checkInMemoryRateLimit } from "./rateLimit";
import { useNoRedisEnv } from "./testSupport";

describe("checkInMemoryRateLimit", () => {
  it("窗口内未超限时不拦截", () => {
    const key = `test:allow:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkInMemoryRateLimit(key, 3, 60_000)).toBeNull();
    }
  });

  it("超过限制返回 429", () => {
    const key = `test:block:${Math.random()}`;
    expect(checkInMemoryRateLimit(key, 2, 60_000)).toBeNull();
    expect(checkInMemoryRateLimit(key, 2, 60_000)).toBeNull();
    const result = checkInMemoryRateLimit(key, 2, 60_000);
    expect(result?.status).toBe(429);
  });

  it("窗口过期后重新计数", () => {
    jest.useFakeTimers();
    try {
      const key = `test:window:${Math.random()}`;
      expect(checkInMemoryRateLimit(key, 1, 1000)).toBeNull();
      expect(checkInMemoryRateLimit(key, 1, 1000)?.status).toBe(429);
      jest.advanceTimersByTime(1001);
      expect(checkInMemoryRateLimit(key, 1, 1000)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("桶数量达到上限后淘汰最旧条目，不会无界增长", () => {
    const keys = Array.from({ length: MAX_BUCKETS + 1 }, (_, index) => `test:cap:${index}`);
    for (const key of keys) {
      expect(checkInMemoryRateLimit(key, 1, 60_000)).toBeNull();
    }

    expect(checkInMemoryRateLimit(keys[0], 1, 60_000)).toBeNull();
    expect(checkInMemoryRateLimit(keys.at(-1)!, 1, 60_000)?.status).toBe(429);
  });
});

describe("checkRateLimit", () => {
  useNoRedisEnv();

  afterEach(() => {
    jest.useRealTimers();
  });

  it("未配置 Redis 时回退到进程内限流", async () => {
    const key = `test:fallback:${Math.random()}`;
    expect(await checkRateLimit(key, 1, 60_000)).toBeNull();
    const result = await checkRateLimit(key, 1, 60_000);
    expect(result?.status).toBe(429);
  });
});
