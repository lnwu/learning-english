import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from "bun:test";
import { checkRateLimit, checkInMemoryRateLimit } from "./rateLimit";

const REDIS_ENV_KEYS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

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
});

describe("checkRateLimit", () => {
  const savedEnv = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of REDIS_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of REDIS_ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

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
