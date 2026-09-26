import { describe, it, expect } from "bun:test";
import {
  calculateMasteryScore,
  calculatePriority,
  computeBaselineInputTime,
  computeBaselinesByLengthCategory,
  getExpectedInputTime,
  getWordLengthCategory,
  type WordPracticeData,
} from "./masteryCalculator";
import { formatLocalPracticeDate } from "./practiceDate";

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

describe("computeBaselineInputTime", () => {
  it("样本不足 5 条时返回 null", () => {
    expect(computeBaselineInputTime([])).toBeNull();
    expect(computeBaselineInputTime([1, 2, 3, 4])).toBeNull();
  });

  it("样本足够时返回中位数，对单次异常耗时稳健", () => {
    expect(computeBaselineInputTime([1, 2, 3, 4, 5])).toBe(3);
    expect(computeBaselineInputTime([1, 2, 3, 4, 100])).toBe(3);
  });
});

describe("getWordLengthCategory", () => {
  it("按词长分为短/中/长三档", () => {
    expect(getWordLengthCategory("apple")).toBe(0);
    expect(getWordLengthCategory("banana")).toBe(1);
    expect(getWordLengthCategory("pronunciation")).toBe(2);
  });

  it("档位边界为 5 与 10", () => {
    expect(getWordLengthCategory("abcde")).toBe(0);
    expect(getWordLengthCategory("abcdef")).toBe(1);
    expect(getWordLengthCategory("abcdefghij")).toBe(1);
    expect(getWordLengthCategory("abcdefghijk")).toBe(2);
  });
});

describe("computeBaselinesByLengthCategory", () => {
  it("按长度档汇总样本，每档样本 ≥5 时返回中位数", () => {
    const baselines = computeBaselinesByLengthCategory([
      ["apple", { inputTimes: [2, 2, 3, 10, 4] }],
      ["banana", { inputTimes: [4, 4, 4, 4] }],
      ["pronunciation", { inputTimes: [6, 6, 6, 6, 6, 6] }],
    ]);

    expect(baselines).toEqual([3, null, 6]);
  });

  it("无单词时每档都是 null", () => {
    expect(computeBaselinesByLengthCategory([])).toEqual([null, null, null]);
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
    const result = calculateMasteryScore(baseWord, null);
    expect(result.score).toBe(0);
    expect(result.level).toBe("new");
  });

  it("尝试次数不足 3 时封顶 39 分", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 2,
        totalAttempts: 2,
        inputTimes: [2, 2],
        correctPracticeDates: ["2026-08-14"],
      },
      null
    );
    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.level).not.toBe("mastered");
  });

  it("尝试次数不足 5 或复习天数不足 2 时封顶 59 分", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 4,
        totalAttempts: 4,
        inputTimes: [2, 2, 2, 2],
        correctPracticeDates: ["2026-08-14"],
      },
      null
    );
    expect(result.score).toBeLessThanOrEqual(59);
  });

  it("错误多次后经提示完成（正确率过低）只能到 learning", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 1,
        totalAttempts: 5,
        inputTimes: [1.2],
        correctPracticeDates: ["2026-08-14"],
      },
      null
    );
    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.level).toBe("learning");
  });

  it("正确率不足 70% 时达不到 proficient 以上", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 4,
        totalAttempts: 7,
        inputTimes: [2, 2, 2, 2],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.level).not.toBe("proficient");
  });

  it("早期错误被近期窗口洗掉后不再压低等级", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 40,
        totalAttempts: 80,
        inputTimes: [1, 1, 1, 1, 1],
        attemptHistory: Array(30).fill(true),
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("mastered");
  });

  it("近期窗口正确率崩塌时等级门槛向下生效", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 90,
        totalAttempts: 100,
        inputTimes: [2, 2, 2, 2, 2],
        attemptHistory: [...Array(15).fill(true), ...Array(15).fill(false)],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.level).toBe("familiar");
  });

  it("历史不足 3 条时等级门槛回退全量正确率", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 4,
        totalAttempts: 10,
        inputTimes: [2, 2, 2, 2],
        attemptHistory: [true, true],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.score).toBeLessThanOrEqual(39);
    expect(result.level).toBe("learning");
  });

  it("等级门槛窗口需至少 5 条近期记录才启用", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 90,
        totalAttempts: 100,
        inputTimes: [2, 2, 2, 2, 2],
        attemptHistory: [true, true, true, true, false],
        correctPracticeDates: ["2026-08-08", "2026-08-12", "2026-08-17"],
      },
      null
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("mastered");
  });

  it("有个人基线时速度分按基线归一化", () => {
    const base = {
      ...baseWord,
      correctCount: 5,
      totalAttempts: 5,
      inputTimes: [4, 4, 4, 4, 4],
      correctPracticeDates: ["2026-08-14"],
    };
    const withoutBaseline = calculateMasteryScore(base, null);
    const withBaseline = calculateMasteryScore(base, 8);
    expect(withoutBaseline.speedScore).toBe(25);
    expect(withBaseline.speedScore).toBe(100);
  });

  it("基线为 0 或 null 时回退长度启发式", () => {
    const base = {
      ...baseWord,
      correctCount: 5,
      totalAttempts: 5,
      inputTimes: [4, 4, 4, 4, 4],
      correctPracticeDates: ["2026-08-14"],
    };
    expect(calculateMasteryScore(base, 0).speedScore).toBe(25);
    expect(calculateMasteryScore(base, null).speedScore).toBe(25);
  });

  it("异常耗时上限随个人基线放宽", () => {
    const base = {
      ...baseWord,
      correctCount: 5,
      totalAttempts: 5,
      inputTimes: [4, 4, 4, 4, 20],
      correctPracticeDates: ["2026-08-14"],
    };
    const withoutBaseline = calculateMasteryScore(base, null);
    const withBaseline = calculateMasteryScore(base, 8);
    expect(withoutBaseline.speedScore).toBe(25);
    expect(withBaseline.speedScore).toBe(56);
  });

  it("8 次全对且复习 3 天达到已掌握", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
        lastPracticedAt: new Date("2026-08-15T10:00:00Z"),
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("mastered");
  });

  it("重复同一天只算一个复习日", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
        correctPracticeDates: ["2026-08-14", "2026-08-14", "2026-08-14"],
      },
      null
    );
    expect(result.reviewScore).toBeLessThanOrEqual(33);
  });

  it("间隔复习比连天突击获得更高跨天复习分", () => {
    const cramped = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    const spaced = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
        correctPracticeDates: ["2026-08-01", "2026-08-06", "2026-08-13"],
      },
      null
    );
    expect(cramped.reviewScore).toBe(67);
    expect(spaced.reviewScore).toBe(100);
  });

  it("间隔过大时复习权重不再提高", () => {
    const spaced = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
        correctPracticeDates: ["2026-08-01", "2026-08-06", "2026-08-13"],
      },
      null
    );
    const tooSpaced = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 2],
        correctPracticeDates: ["2026-05-01", "2026-05-06", "2026-05-13"],
      },
      null
    );
    expect(tooSpaced.reviewScore).toBe(100);
    expect(spaced.reviewScore).toBeGreaterThanOrEqual(tooSpaced.reviewScore);
  });

  it("分数始终限制在 0-100", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 3,
        totalAttempts: 3,
        inputTimes: [100, 100, 100],
        correctPracticeDates: ["2026-08-14"],
      },
      null
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("无输入计时（纯造句）8 次全对跨 3 天可达到 mastered", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("mastered");
  });

  it("输入计时样本不足 3 时稳定性因子不参与加权", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [1.5, 1.8],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("单次中断异常耗时不影响稳定性", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 60],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.consistencyScore).toBeGreaterThanOrEqual(90);
  });

  it("持续波动仍得较低稳定性分", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 8, 2, 8, 2, 8, 2, 8],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.consistencyScore).toBeLessThanOrEqual(40);
  });

  it("过半异常耗时被清洗后稳定样本不足则不参与加权", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [60, 61, 62, 2, 2],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.consistencyScore).toBe(50);
  });

  it("速度分过滤单次异常耗时", () => {
    const result = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: [2, 2, 2, 2, 2, 2, 2, 60],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(result.speedScore).toBeGreaterThanOrEqual(40);
  });

  it("近期正确率高于全量时 accuracyScore 更高", () => {
    const withRecent = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 12,
        inputTimes: [2],
        attemptHistory: [false, false, false, false, ...Array(8).fill(true)],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    const withoutRecent = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 8,
        totalAttempts: 12,
        inputTimes: [2],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(withRecent.accuracyScore).toBeGreaterThan(
      withoutRecent.accuracyScore
    );
  });

  it("近期正确率低于全量时 accuracyScore 更低", () => {
    const withRecent = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 10,
        totalAttempts: 12,
        inputTimes: [2],
        attemptHistory: [
          ...Array(8).fill(true),
          false,
          false,
          false,
          false,
        ],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      },
      null
    );
    expect(withRecent.accuracyScore).toBeLessThan(100);
  });

  it("历史样本不足 3 时不启用近期窗口", () => {
    const withShortHistory = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 2,
        totalAttempts: 3,
        inputTimes: [2],
        attemptHistory: [true, false, true],
        correctPracticeDates: ["2026-08-14"],
      },
      null
    );
    const withoutHistory = calculateMasteryScore(
      {
        ...baseWord,
        correctCount: 2,
        totalAttempts: 3,
        inputTimes: [2],
        correctPracticeDates: ["2026-08-14"],
      },
      null
    );
    expect(withShortHistory.accuracyScore).toBe(withoutHistory.accuracyScore);
  });
});

describe("calculatePriority", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date("2026-08-20T12:00:00Z").getTime();
  const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY);
  const data = (
    overrides: Partial<WordPracticeData> = {}
  ): WordPracticeData => ({
    word: "w",
    correctCount: 0,
    totalAttempts: 0,
    inputTimes: [],
    lastPracticedAt: null,
    correctPracticeDates: [],
    attemptHistory: [],
    ...overrides,
  });

  it("基础优先级与熟练度负相关", () => {
    const low = calculatePriority(
      20,
      data({ lastPracticedAt: at(1), totalAttempts: 5 }),
      NOW
    );
    const high = calculatePriority(
      80,
      data({ lastPracticedAt: at(1), totalAttempts: 5 }),
      NOW
    );
    expect(low).toBeGreaterThan(high);
  });

  it("熟练度 100 时仍保留最低基础优先级", () => {
    const priority = calculatePriority(
      100,
      data({ lastPracticedAt: at(0.5), totalAttempts: 20 }),
      NOW
    );
    expect(priority).toBeCloseTo(10 * 0.3 * 0.8, 10);
  });

  it("时间分段倍率正确", () => {
    const timed = (daysAgo: number) =>
      calculatePriority(
        0,
        data({ lastPracticedAt: at(daysAgo), totalAttempts: 1 }),
        NOW
      );
    expect(timed(0.5)).toBeCloseTo(100 * 0.3 * 2.0, 10);
    expect(timed(1.5)).toBeCloseTo(100 * 0.8 * 2.0, 10);
    expect(timed(3)).toBeCloseTo(100 * 1.2 * 2.0, 10);
    expect(timed(5)).toBeCloseTo(100 * 2.0 * 2.0, 10);
    expect(timed(10)).toBeCloseTo(100 * 8.0 * 2.0, 10);
    expect(timed(14.5)).toBeCloseTo(100 * 15.0 * 2.0, 10);
  });

  it("练习次数分段倍率正确", () => {
    const withAttempts = (totalAttempts: number) =>
      calculatePriority(
        0,
        data({ lastPracticedAt: at(5), totalAttempts }),
        NOW
      );
    expect(withAttempts(0)).toBeCloseTo(100 * 2.0 * 3.0, 10);
    expect(withAttempts(2)).toBeCloseTo(100 * 2.0 * 2.0, 10);
    expect(withAttempts(3)).toBeCloseTo(100 * 2.0 * 1.5, 10);
    expect(withAttempts(10)).toBeCloseTo(100 * 2.0 * 1.0, 10);
    expect(withAttempts(11)).toBeCloseTo(100 * 2.0 * 0.8, 10);
  });

  it("未练习单词优先级最高", () => {
    const never = calculatePriority(0, data(), NOW);
    const practiced = calculatePriority(
      0,
      data({ lastPracticedAt: at(1), totalAttempts: 3 }),
      NOW
    );
    expect(never).toBeGreaterThan(practiced);
  });

  it("最近一次尝试错误时失败倍率为 3 倍", () => {
    const failed = calculatePriority(
      50,
      data({
        lastPracticedAt: at(0.5),
        totalAttempts: 5,
        attemptHistory: [true, true, false],
      }),
      NOW
    );
    expect(failed).toBeCloseTo(50 * 0.3 * 1.5 * 3.0, 10);
  });

  it("最近一次尝试正确或历史为空时失败倍率为 1", () => {
    const correct = calculatePriority(
      50,
      data({
        lastPracticedAt: at(0.5),
        totalAttempts: 5,
        attemptHistory: [false, false, true],
      }),
      NOW
    );
    const empty = calculatePriority(
      50,
      data({ lastPracticedAt: at(0.5), totalAttempts: 5 }),
      NOW
    );
    expect(correct).toBeCloseTo(50 * 0.3 * 1.5 * 1.0, 10);
    expect(empty).toBe(correct);
  });

  it("答错后的优先级不低于答错前", () => {
    const before = calculatePriority(
      60,
      data({ lastPracticedAt: at(1), totalAttempts: 3, attemptHistory: [true, true] }),
      NOW
    );
    const after = calculatePriority(
      55,
      data({
        lastPracticedAt: at(0.1),
        totalAttempts: 4,
        attemptHistory: [true, true, false],
      }),
      NOW
    );
    expect(after).toBeGreaterThan(before);
  });

  it("逾期后答错仍保持高优先级", () => {
    const dateDaysAgo = (days: number) =>
      formatLocalPracticeDate(new Date(NOW - days * DAY));

    const overdueFailed = calculatePriority(
      60,
      data({
        lastPracticedAt: at(0.1),
        totalAttempts: 6,
        attemptHistory: [true, false],
        correctPracticeDates: [dateDaysAgo(10)],
      }),
      NOW
    );
    const beforeFailure = calculatePriority(
      60,
      data({ lastPracticedAt: at(10), totalAttempts: 6, attemptHistory: [true, true] }),
      NOW
    );

    expect(overdueFailed).toBeCloseTo(40 * 8.0 * 1.0 * 3.0, 5);
    expect(overdueFailed).toBeGreaterThan(beforeFailure);
  });

  it("最近一次答对时仍按 lastPracticedAt 计算", () => {
    const dateDaysAgo = (days: number) =>
      formatLocalPracticeDate(new Date(NOW - days * DAY));

    const priority = calculatePriority(
      50,
      data({
        lastPracticedAt: at(0.5),
        totalAttempts: 5,
        attemptHistory: [false, false, true],
        correctPracticeDates: [dateDaysAgo(10)],
      }),
      NOW
    );
    expect(priority).toBeCloseTo(50 * 0.3 * 1.5 * 1.0, 10);
  });

  it("答错但没有答对记录时回退 lastPracticedAt", () => {
    const priority = calculatePriority(
      50,
      data({
        lastPracticedAt: at(0.5),
        totalAttempts: 5,
        attemptHistory: [true, true, false],
        correctPracticeDates: [],
      }),
      NOW
    );
    expect(priority).toBeCloseTo(50 * 0.3 * 1.5 * 3.0, 10);
  });
});
