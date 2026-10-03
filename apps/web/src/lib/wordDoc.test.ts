import { describe, it, expect } from "bun:test";
import {
  attemptUpdateFields,
  newWordDocFields,
  parseWordDoc,
  practiceFields,
  resetPracticeFields,
  translationFields,
} from "./wordDoc";
import { MODEL_VERSION, initialMemory, initialStats } from "./masteryModel";
import type { WordData } from "./wordsStore";

const makeWordData = (overrides: Partial<WordData> = {}): WordData => ({
  word: "apple",
  translation: "苹果",
  memory: {
    ...initialMemory(1000),
    stability: 2.3065,
    difficulty: 2.1181,
    state: "learning",
    learningSteps: 1,
    due: 2000,
    lastReviewAt: 1000,
    lastGrade: 3,
    reps: 1,
  },
  stats: {
    reviewDays: 1,
    lastReviewDay: "2026-01-01",
    dailyReviews: 1,
    hints: 0,
  },
  inputTimes: [1.5],
  reviews: [{ id: "r1", at: 1000, g: 3, h: false, r: null, s: 2.3065, d: 2.1181 }],
  createdAt: new Date("2025-12-31T00:00:00Z"),
  id: "id-apple",
  ...overrides,
});

describe("translationFields", () => {
  it("把结构化义项编码为持久化字符串", () => {
    expect(translationFields([{ pos: "n.", chinese: "苹果", english: "a round fruit" }])).toEqual({
      translation: "n. 苹果 — a round fruit",
    });
    expect(translationFields([])).toEqual({ translation: "" });
  });
});

describe("newWordDocFields", () => {
  it("新词文档带初始记忆状态与创建时间", () => {
    const fields = newWordDocFields("apple", [
      { pos: "n.", chinese: "苹果", english: "a round fruit" },
    ]);

    expect(fields.word).toBe("apple");
    expect(fields.translation).toBe("n. 苹果 — a round fruit");
    expect(fields.memory.state).toBe("new");
    expect(fields.memory.reps).toBe(0);
    expect(fields.memory.modelVersion).toBe(MODEL_VERSION);
    expect(fields.stats).toEqual(initialStats());
    expect(fields.inputTimes).toEqual([]);
    expect(fields.reviews).toEqual([]);
    expect(fields.createdAt).toBeInstanceOf(Date);
  });
});

describe("practiceFields", () => {
  it("同步载荷只包含新模型字段", () => {
    const data = makeWordData();

    expect(practiceFields(data)).toEqual({
      memory: data.memory,
      stats: data.stats,
      inputTimes: [1.5],
      reviews: data.reviews,
    });
  });
});

describe("attemptUpdateFields", () => {
  it("写入完整记忆状态与复习日志", () => {
    const data = makeWordData();
    const fields = attemptUpdateFields(practiceFields(data));

    expect(fields.memory).toEqual(data.memory);
    expect(fields.stats).toEqual(data.stats);
    expect(fields.inputTimes).toEqual([1.5]);
    expect(fields.reviews).toEqual(data.reviews);
  });
});

describe("resetPracticeFields", () => {
  it("返回重置后的字段", () => {
    const fields = resetPracticeFields(1234);

    expect(fields.memory.state).toBe("new");
    expect(fields.memory.due).toBe(1234);
    expect(fields.stats).toEqual(initialStats());
    expect(fields.inputTimes).toEqual([]);
    expect(fields.reviews).toEqual([]);
  });
});

describe("parseWordDoc", () => {
  it("缺失字段使用初始状态", () => {
    const data = parseWordDoc("id-1", { word: "apple", translation: "苹果" });

    expect(data.memory.state).toBe("new");
    expect(data.memory.reps).toBe(0);
    expect(data.stats).toEqual(initialStats());
    expect(data.inputTimes).toEqual([]);
    expect(data.reviews).toEqual([]);
    expect(data.id).toBe("id-1");
  });

  it("解析完整记忆状态、统计与复习日志", () => {
    const data = parseWordDoc("id-1", {
      word: "apple",
      translation: "苹果",
      memory: {
        stability: 10.971,
        difficulty: 2.1043,
        state: "review",
        learningSteps: 0,
        due: 5000,
        lastReviewAt: 4000,
        lastGrade: 3,
        reps: 3,
        lapses: 1,
        modelVersion: MODEL_VERSION,
      },
      stats: {
        reviewDays: 2,
        lastReviewDay: "2026-01-02",
        dailyReviews: 1,
        hints: 2,
      },
      inputTimes: [2, 3],
      reviews: [
        { id: "r1", at: 1000, g: 3, h: false, r: null, s: 2.3, d: 2.1 },
        { id: "r2", at: 4000, g: 2, h: true, r: 0.9, s: 10.9, d: 2.1 },
      ],
      createdAt: { toDate: () => new Date("2026-01-01") },
    });

    expect(data.memory.stability).toBe(10.971);
    expect(data.memory.state).toBe("review");
    expect(data.stats.reviewDays).toBe(2);
    expect(data.stats.hints).toBe(2);
    expect(data.inputTimes).toEqual([2, 3]);
    expect(data.reviews).toHaveLength(2);
    expect(data.reviews[1]).toMatchObject({ id: "r2", g: 2, h: true, r: 0.9 });
  });

  it("过滤非法复习日志并截断超限数组", () => {
    const data = parseWordDoc("id-1", {
      word: "apple",
      translation: "苹果",
      inputTimes: [1, "bad", Number.NaN, 2],
      reviews: [
        { id: "ok", at: 5, g: 3, h: false, r: null, s: 1, d: 1 },
        { id: "bad", at: 6, g: 9, h: false, r: null, s: 1, d: 1 },
        { nope: true },
      ],
    });

    expect(data.inputTimes).toEqual([1, 2]);
    expect(data.reviews).toHaveLength(1);
    expect(data.reviews[0].id).toBe("ok");
  });
});
