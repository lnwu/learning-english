import { describe, it, expect } from "bun:test";
import {
  MIN_SENTENCE_WORDS,
  MAX_SENTENCE_WORDS,
  pickSentenceWords,
  pickWordCount,
} from "./sentenceWords";

describe("pickWordCount", () => {
  it("在 min-max 之间取值", () => {
    expect(pickWordCount(() => 0)).toBe(MIN_SENTENCE_WORDS);
    expect(pickWordCount(() => 0.999)).toBe(MAX_SENTENCE_WORDS);
  });

  it("支持自定义范围", () => {
    expect(pickWordCount(() => 0, { min: 1, max: 1 })).toBe(1);
  });
});

describe("pickSentenceWords", () => {
  it("随机抽取指定数量且不重复", () => {
    const picked = pickSentenceWords(["a", "b", "c", "d"], {
      count: 3,
      rng: () => 0.3,
    });

    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("请求数量超过词库总量时返回全部", () => {
    const picked = pickSentenceWords(["a", "b"], {
      count: 5,
      rng: () => 0.5,
    });

    expect(picked.sort()).toEqual(["a", "b"]);
  });

  it("空词库或非法数量返回空数组", () => {
    expect(pickSentenceWords([], { count: 3, rng: () => 0.5 })).toEqual([]);
    expect(pickSentenceWords(["a"], { count: 0, rng: () => 0.5 })).toEqual([]);
  });

  it("所有候选词都有机会被抽中", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      pickSentenceWords(["a", "b", "c"], { count: 1, rng: Math.random }).forEach((word) =>
        counts.set(word, (counts.get(word) ?? 0) + 1),
      );
    }

    expect(counts.size).toBe(3);
  });
});
