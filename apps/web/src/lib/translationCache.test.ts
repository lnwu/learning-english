import { describe, it, expect } from "bun:test";
import {
  getCachedTranslation,
  setCachedTranslation,
  type TranslationCacheEntry,
} from "./translationCache";
import { useNoRedisEnv } from "./testSupport";

const makeEntry = (): TranslationCacheEntry => ({
  lemma: "apple",
  senses: [{ pos: "n.", chinese: "苹果", english: "a fruit" }],
});

describe("translationCache", () => {
  useNoRedisEnv();

  it("写入后可读取", async () => {
    const word = `cache-${Math.random()}`;
    const entry = makeEntry();
    setCachedTranslation(word, entry);
    expect(await getCachedTranslation(word)).toEqual(entry);
  });

  it("未识别单词不写入缓存", async () => {
    const word = `invalid-${Math.random()}`;
    setCachedTranslation(word, { lemma: word, senses: null });
    expect(await getCachedTranslation(word)).toBeUndefined();
  });

  it("未命中返回 undefined", async () => {
    expect(await getCachedTranslation(`missing-${Math.random()}`)).toBeUndefined();
  });
});
