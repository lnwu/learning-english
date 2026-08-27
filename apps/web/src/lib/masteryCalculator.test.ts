import { describe, it, expect } from "bun:test";
import {
  calculateMasteryScore,
  calculatePriority,
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

  it("错误多次后经提示完成（正确率过低）只能到 learning", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 1,
      totalAttempts: 5,
      inputTimes: [1.2],
      correctPracticeDates: ["2026-08-14"],
    });
    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.level).toBe("learning");
  });

  it("正确率不足 70% 时达不到 proficient 以上", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 4,
      totalAttempts: 7,
      inputTimes: [2, 2, 2, 2],
      correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    });
    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.level).not.toBe("proficient");
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

  it("无输入计时（纯造句）8 次全对跨 3 天可达到 mastered", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 8,
      totalAttempts: 8,
      inputTimes: [],
      correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("mastered");
  });

  it("输入计时样本不足 3 时稳定性因子不参与加权", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 8,
      totalAttempts: 8,
      inputTimes: [1.5, 1.8],
      correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("单次中断异常耗时不影响稳定性", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 8,
      totalAttempts: 8,
      inputTimes: [2, 2, 2, 2, 2, 2, 2, 60],
      correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    });
    expect(result.consistencyScore).toBeGreaterThanOrEqual(90);
  });

  it("持续波动仍得较低稳定性分", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 8,
      totalAttempts: 8,
      inputTimes: [2, 8, 2, 8, 2, 8, 2, 8],
      correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    });
    expect(result.consistencyScore).toBeLessThanOrEqual(40);
  });

  it("速度分过滤单次异常耗时", () => {
    const result = calculateMasteryScore({
      ...baseWord,
      correctCount: 8,
      totalAttempts: 8,
      inputTimes: [2, 2, 2, 2, 2, 2, 2, 60],
      correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    });
    expect(result.speedScore).toBeGreaterThanOrEqual(40);
  });
});

describe("calculatePriority", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);

  it("基础优先级与熟练度负相关", () => {
    const low = calculatePriority(20, at(1), 5);
    const high = calculatePriority(80, at(1), 5);
    expect(low).toBeGreaterThan(high);
  });

  it("熟练度 100 时仍保留最低基础优先级", () => {
    const priority = calculatePriority(100, at(0.5), 20);
    expect(priority).toBeCloseTo(10 * 0.3 * 0.8, 10);
  });

  it("时间分段倍率正确", () => {
    expect(calculatePriority(0, at(0.5), 1)).toBeCloseTo(100 * 0.3 * 2.0, 10);
    expect(calculatePriority(0, at(1.5), 1)).toBeCloseTo(100 * 0.8 * 2.0, 10);
    expect(calculatePriority(0, at(3), 1)).toBeCloseTo(100 * 1.2 * 2.0, 10);
    expect(calculatePriority(0, at(5), 1)).toBeCloseTo(100 * 2.0 * 2.0, 10);
    expect(calculatePriority(0, at(10), 1)).toBeCloseTo(100 * 8.0 * 2.0, 10);
    expect(calculatePriority(0, at(14.5), 1)).toBeCloseTo(100 * 15.0 * 2.0, 10);
  });

  it("练习次数分段倍率正确", () => {
    expect(calculatePriority(0, at(5), 0)).toBeCloseTo(100 * 2.0 * 3.0, 10);
    expect(calculatePriority(0, at(5), 2)).toBeCloseTo(100 * 2.0 * 2.0, 10);
    expect(calculatePriority(0, at(5), 3)).toBeCloseTo(100 * 2.0 * 1.5, 10);
    expect(calculatePriority(0, at(5), 10)).toBeCloseTo(100 * 2.0 * 1.0, 10);
    expect(calculatePriority(0, at(5), 11)).toBeCloseTo(100 * 2.0 * 0.8, 10);
  });

  it("未练习单词优先级最高", () => {
    const never = calculatePriority(0, null, 0);
    const practiced = calculatePriority(0, at(1), 3);
    expect(never).toBeGreaterThan(practiced);
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