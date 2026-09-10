import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  getCachedTranslation,
  setCachedTranslation,
  type TranslationCacheEntry,
} from "./translationCache";

const REDIS_ENV_KEYS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

const makeEntry = (): TranslationCacheEntry => ({
  senses: [{ pos: "n.", chinese: "苹果", english: "a fruit" }],
});

describe("translationCache", () => {
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

  it("写入后可读取", async () => {
    const word = `cache-${Math.random()}`;
    const entry = makeEntry();
    setCachedTranslation(word, entry);
    expect(await getCachedTranslation(word)).toEqual(entry);
  });

  it("未识别单词不写入缓存", async () => {
    const word = `invalid-${Math.random()}`;
    setCachedTranslation(word, { senses: null });
    expect(await getCachedTranslation(word)).toBeUndefined();
  });

  it("未命中返回 undefined", async () => {
    expect(
      await getCachedTranslation(`missing-${Math.random()}`)
    ).toBeUndefined();
  });
});
