import { describe, it, expect } from "bun:test";
import {
  attemptUpdateFields,
  newWordDocFields,
  parseWordDoc,
  practiceFields,
  resetPracticeFields,
  translationFields,
} from "./wordDoc";
import type { WordData } from "./wordsStore";

const makeWordData = (overrides: Partial<WordData> = {}): WordData => ({
  word: "apple",
  translation: "苹果",
  correctCount: 2,
  totalAttempts: 3,
  inputTimes: [1, 2],
  lastPracticedAt: new Date("2026-01-01T00:00:00"),
  correctPracticeDates: ["2026-01-01"],
  attemptHistory: [true, false, true],
  createdAt: new Date("2025-12-31T00:00:00"),
  id: "id-apple",
  ...overrides,
});

describe("translationFields", () => {
  it("把结构化义项编码为持久化字符串", () => {
    expect(
      translationFields([
        { pos: "n.", chinese: "苹果", english: "a round fruit" },
      ])
    ).toEqual({ translation: "n. 苹果 — a round fruit" });
    expect(translationFields([])).toEqual({ translation: "" });
  });
});

describe("newWordDocFields", () => {
  it("新词文档带零值练习字段与创建时间", () => {
    const fields = newWordDocFields("apple", [
      { pos: "n.", chinese: "苹果", english: "a round fruit" },
    ]);

    expect(fields.word).toBe("apple");
    expect(fields.translation).toBe("n. 苹果 — a round fruit");
    expect(fields.correctCount).toBe(0);
    expect(fields.totalAttempts).toBe(0);
    expect(fields.inputTimes).toEqual([]);
    expect(fields.lastPracticedAt).toBeNull();
    expect(fields.correctPracticeDates).toEqual([]);
    expect(fields.attemptHistory).toEqual([]);
    expect(fields.createdAt).toBeInstanceOf(Date);
  });
});

describe("practiceFields", () => {
  it("只保留需要同步的字段", () => {
    expect(practiceFields(makeWordData())).toEqual({
      correctCount: 2,
      totalAttempts: 3,
      inputTimes: [1, 2],
      correctPracticeDates: ["2026-01-01"],
      attemptHistory: [true, false, true],
    });
  });
});

describe("attemptUpdateFields", () => {
  it("可选字段存在时写入，lastPracticedAt 取队列时间戳", () => {
    const fields = attemptUpdateFields(
      {
        correctCount: 2,
        totalAttempts: 3,
        inputTimes: [1, 2],
        correctPracticeDates: ["2026-01-01"],
        attemptHistory: [true, false],
      },
      1767225600000
    );

    expect(fields.correctCount).toBe(2);
    expect(fields.totalAttempts).toBe(3);
    expect(fields.inputTimes).toEqual([1, 2]);
    expect(fields.correctPracticeDates).toEqual(["2026-01-01"]);
    expect(fields.attemptHistory).toEqual([true, false]);
    expect(fields.lastPracticedAt).toBeInstanceOf(Date);
    expect(fields.lastPracticedAt.getTime()).toBe(1767225600000);
  });

  it("可选字段缺失时不写入对应键", () => {
    const fields = attemptUpdateFields(
      { correctCount: 0, totalAttempts: 1, inputTimes: [] },
      1000
    );

    expect("correctPracticeDates" in fields).toBe(false);
    expect("attemptHistory" in fields).toBe(false);
    expect(fields.lastPracticedAt.getTime()).toBe(1000);
  });
});

describe("resetPracticeFields", () => {
  it("返回清空后的练习字段", () => {
    expect(resetPracticeFields()).toEqual({
      correctCount: 0,
      totalAttempts: 0,
      inputTimes: [],
      lastPracticedAt: null,
      correctPracticeDates: [],
      attemptHistory: [],
    });
  });
});

describe("parseWordDoc", () => {
  it("缺失字段使用默认值", () => {
    const data = parseWordDoc("id-1", { word: "apple", translation: "苹果" });
    expect(data.correctCount).toBe(0);
    expect(data.totalAttempts).toBe(0);
    expect(data.inputTimes).toEqual([]);
    expect(data.lastPracticedAt).toBeNull();
    expect(data.correctPracticeDates).toEqual([]);
    expect(data.attemptHistory).toEqual([]);
    expect(data.id).toBe("id-1");
  });

  it("时间戳字段调用 toDate 转换", () => {
    const practiced = new Date("2026-02-01T10:00:00");
    const data = parseWordDoc("id-1", {
      word: "apple",
      translation: "苹果",
      lastPracticedAt: { toDate: () => practiced },
      createdAt: { toDate: () => new Date("2026-01-01") },
    });
    expect(data.lastPracticedAt).toBe(practiced);
  });

  it("correctPracticeDates 统一归一化为本地日期", () => {
    const data = parseWordDoc("id-1", {
      word: "apple",
      translation: "苹果",
      correctPracticeDates: ["2026-01-02", "2026-01-03T12:00:00.000Z"],
    });
    expect(data.correctPracticeDates[0]).toBe("2026-01-02");
    expect(data.correctPracticeDates[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
