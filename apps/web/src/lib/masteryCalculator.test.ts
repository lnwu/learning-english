import { describe, it, expect } from "vitest";
import {
  calculateMasteryScore,
  getExpectedInputTime,
  getMasteryLevel,
  getMasteryLevelIndex,
} from "./masteryCalculator";

describe("getExpectedInputTime", () => {
  it("短词使用固定值", () => {
    expect(getExpectedInputTime(3)).toBe(1.5);
    expect(getExpectedInputTime(5)).toBe(2.0);
  });

  it("长词按长度线性估算", () => {
    expect(getExpectedInputTime(6)).toBeCloseTo(6 * 0.35 + 0.5);
    expect(getExpectedInputTime(9)).toBeCloseTo(9 * 0.4 + 0.5);
  });
});

describe("calculateMasteryScore", () => {
  const baseWord = {
    word: "apple",
    correctCount: 0,
    totalAttempts: 0,
    inputTimes: [],
    lastPracticedAt: null,
    correctPracticeDates: [],
  };

  it("无练习记录时为 new 且 0 分", () => {
    const result = calculateMasteryScore(baseWord);
    expect(result.score).toBe(0);
    expect(result.level).toBe("new");
  });

  it("尝试次数不足 3 时封顶 39 分", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 2,
      totalAttempts: 2,
      inputTimes: [2, 2],
      correctPracticeDates: ["2026-08-14"],
    });
    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.level).not.toBe("mastered");
  });

  it("尝试次数不足 5 或复习天数不足 2 时封顶 59 分", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 4,
      totalAttempts: 4,
      inputTimes: [2, 2, 2, 2],
      correctPracticeDates: ["2026-08-14"],
    });
    expect(result.score).toBeLessThanOrEqual(59);
  });

  it("8 次全对且复习 3 天达到已掌握", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 8,
      totalAttempts: 8,
      inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
      lastPracticedAt: new Date("2026-08-15T10:00:00Z"),
      correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("mastered");
  });

  it("重复同一天只算一个复习日", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 8,
      totalAttempts: 8,
      inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
      correctPracticeDates: ["2026-08-14", "2026-08-14", "2026-08-14"],
    });
    expect(result.reviewScore).toBeLessThanOrEqual(33);
  });

  it("分数始终限制在 0-100", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 3,
      totalAttempts: 3,
      inputTimes: [100, 100, 100],
      correctPracticeDates: ["2026-08-14"],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("getMasteryLevel", () => {
  it("正确映射等级", () => {
    expect(getMasteryLevel(0)).toBe("new");
    expect(getMasteryLevel(19)).toBe("new");
    expect(getMasteryLevel(20)).toBe("learning");
    expect(getMasteryLevel(40)).toBe("familiar");
    expect(getMasteryLevel(60)).toBe("proficient");
    expect(getMasteryLevel(80)).toBe("mastered");
    expect(getMasteryLevel(100)).toBe("mastered");
  });
});

describe("getMasteryLevelIndex", () => {
  it("正确映射等级索引", () => {
    expect(getMasteryLevelIndex(0)).toBe(0);
    expect(getMasteryLevelIndex(20)).toBe(1);
    expect(getMasteryLevelIndex(40)).toBe(2);
    expect(getMasteryLevelIndex(60)).toBe(3);
    expect(getMasteryLevelIndex(80)).toBe(4);
  });
});
