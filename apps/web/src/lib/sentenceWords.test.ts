import { describe, it, expect } from "bun:test";
import {
  MIN_SENTENCE_WORDS,
  MAX_SENTENCE_WORDS,
  pickSentenceWords,
  pickWordCount,
} from "./sentenceWords";
import type { WordData } from "./wordsStore";

const makeData = (
  totalAttempts: number,
  overrides: Partial<WordData> = {}
): WordData => ({
  word: "word",
  translation: "词",
  correctCount: 0,
  totalAttempts,
  inputTimes: [],
  lastPracticedAt: null,
  correctPracticeDates: [],
  attemptHistory: [],
  createdAt: new Date("2026-01-01T00:00:00"),
  id: `id-${totalAttempts}`,
  ...overrides,
});

const entries = (spec: Array<[string, number]>): Array<[string, WordData]> =>
  spec.map(([word, attempts]) => [word, makeData(attempts)]);

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
      entries([
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
      entries([
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
    const picked = pickSentenceWords(entries([["a", 3]]), {
      count: 1,
      rng: () => 0.5,
      minAttempts: 3,
    });

    expect(picked).toEqual(["a"]);
  });

  it("请求数量超过词库总量时返回全部", () => {
    const picked = pickSentenceWords(entries([["a", 0], ["b", 1]]), {
      count: 5,
      rng: () => 0.5,
    });

    expect(picked).toHaveLength(2);
  });

  it("空词库或非法数量返回空数组", () => {
    expect(pickSentenceWords([], { count: 3, rng: () => 0.5 })).toEqual([]);
    expect(pickSentenceWords(entries([["a", 1]]), { count: 0, rng: () => 0.5 })).toEqual([]);
  });

  it("不返回重复单词", () => {
    const picked = pickSentenceWords(
      entries([["a", 4], ["b", 4], ["c", 4], ["d", 4]]),
      { count: 4, rng: () => 0.3 }
    );

    expect(new Set(picked).size).toBe(picked.length);
  });

  it("达标词按抽词优先级加权：高优先级词先被抽中", () => {
    const lowPriority: Array<[string, WordData]> = [
      [
        "a",
        makeData(10, {
          word: "a",
          correctCount: 10,
          inputTimes: [0.5, 0.5, 0.5],
          attemptHistory: Array(10).fill(true),
          correctPracticeDates: ["2026-09-23", "2026-09-24", "2026-09-25"],
          lastPracticedAt: new Date(),
        }),
      ],
    ];
    const highPriority: Array<[string, WordData]> = [
      [
        "b",
        makeData(6, {
          word: "b",
          correctCount: 3,
          attemptHistory: [true, true, true, false, false, false],
          correctPracticeDates: ["2026-09-25"],
          lastPracticedAt: new Date(),
        }),
      ],
    ];
    const pool = [...lowPriority, ...highPriority];

    expect(pickSentenceWords(pool, { count: 1, rng: () => 0.4 })).toEqual(["b"]);
    expect(pickSentenceWords(pool, { count: 1, rng: () => 0.05 })).toEqual(["a"]);
  });

  it("近期答错的词比近期全对的词更容易被抽中", () => {
    const base = {
      word: "w",
      correctCount: 5,
      inputTimes: [1, 1, 1],
      correctPracticeDates: ["2026-09-25"],
      lastPracticedAt: new Date(),
    };
    const pool: Array<[string, WordData]> = [
      ["a", makeData(10, { ...base, attemptHistory: Array(10).fill(true) })],
      [
        "b",
        makeData(10, {
          ...base,
          attemptHistory: [...Array(9).fill(true), false],
        }),
      ],
    ];

    expect(pickSentenceWords(pool, { count: 1, rng: () => 0.5 })).toEqual(["b"]);
  });
});
