import { describe, it, expect } from "bun:test";
import {
  MIN_SENTENCE_WORDS,
  MAX_SENTENCE_WORDS,
  pickSentenceWords,
  pickWordCount,
  type SentenceWordCandidate,
} from "./sentenceWords";

const items = (
  spec: Array<[string, number]>,
  priority = 1
): SentenceWordCandidate[] =>
  spec.map(([word, totalAttempts]) => ({ word, priority, totalAttempts }));

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
  it("优先抽取练习次数达标的单词", () => {
    const picked = pickSentenceWords(
      items([
        ["a", 3],
        ["b", 5],
        ["c", 3],
        ["d", 1],
        ["e", 0],
      ]),
      { count: 2, rng: () => 0.5 }
    );

    expect(picked).toHaveLength(2);
    expect(picked.every((word) => ["a", "b", "c"].includes(word))).toBe(true);
  });

  it("达标单词不足时用少练的单词补位", () => {
    const picked = pickSentenceWords(
      items([
        ["a", 3],
        ["d", 1],
        ["e", 0],
      ]),
      { count: 3, rng: () => 0.5 }
    );

    expect(picked).toHaveLength(3);
    expect(picked).toContain("a");
  });

  it("恰好达到 minAttempts 算达标", () => {
    const picked = pickSentenceWords(items([["a", 3]]), {
      count: 1,
      rng: () => 0.5,
      minAttempts: 3,
    });

    expect(picked).toEqual(["a"]);
  });

  it("请求数量超过词库总量时返回全部", () => {
    const picked = pickSentenceWords(
      items([
        ["a", 0],
        ["b", 1],
      ]),
      { count: 5, rng: () => 0.5 }
    );

    expect(picked).toHaveLength(2);
  });

  it("达标词数量与请求数量相等时全部返回", () => {
    const picked = pickSentenceWords(
      items([
        ["a", 3],
        ["b", 4],
        ["c", 5],
      ]),
      { count: 3, rng: () => 0.5 }
    );

    expect(picked.sort()).toEqual(["a", "b", "c"]);
  });

  it("空词库或非法数量返回空数组", () => {
    expect(pickSentenceWords([], { count: 3, rng: () => 0.5 })).toEqual([]);
    expect(
      pickSentenceWords(items([["a", 1]]), { count: 0, rng: () => 0.5 })
    ).toEqual([]);
  });

  it("不返回重复单词", () => {
    const picked = pickSentenceWords(
      items([
        ["a", 4],
        ["b", 4],
        ["c", 4],
        ["d", 4],
      ]),
      { count: 4, rng: () => 0.3 }
    );

    expect(new Set(picked).size).toBe(picked.length);
  });

  it("达标词按传入的抽词优先级加权：高优先级词更先被抽中", () => {
    const pool: SentenceWordCandidate[] = [
      { word: "a", priority: 10, totalAttempts: 10 },
      { word: "b", priority: 90, totalAttempts: 6 },
    ];

    expect(pickSentenceWords(pool, { count: 1, rng: () => 0.4 })).toEqual(["b"]);
    expect(pickSentenceWords(pool, { count: 1, rng: () => 0.05 })).toEqual(["a"]);
  });
});
