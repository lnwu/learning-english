import { describe, it, expect } from "bun:test";
import {
  ActiveTimeTracker,
  buildPracticeTimeWeeks,
  formatPracticeDuration,
  getPracticeTimeLevel,
  getPracticeTimeMonthLabels,
} from "./practiceTime";

describe("ActiveTimeTracker", () => {
  const createTracker = () => {
    let current = 1_000_000;
    const tracker = new ActiveTimeTracker(() => current);
    return {
      tracker,
      advance: (ms: number) => {
        current += ms;
      },
    };
  };

  it("激活期间累计时间，take 后清零", () => {
    const { tracker, advance } = createTracker();
    tracker.setActive(true);
    advance(5_000);
    expect(tracker.takePendingMs()).toBe(5_000);
    expect(tracker.takePendingMs()).toBe(0);
  });

  it("非激活状态不计时", () => {
    const { tracker, advance } = createTracker();
    advance(10_000);
    expect(tracker.takePendingMs()).toBe(0);
  });

  it("激活/暂停切换时累计分段时间", () => {
    const { tracker, advance } = createTracker();
    tracker.setActive(true);
    advance(3_000);
    tracker.setActive(false);
    advance(10_000);
    tracker.setActive(true);
    advance(2_000);
    expect(tracker.takePendingMs()).toBe(5_000);
  });

  it("重复的 setActive 调用不产生副作用", () => {
    const { tracker, advance } = createTracker();
    tracker.setActive(true);
    tracker.setActive(true);
    advance(4_000);
    tracker.setActive(false);
    tracker.setActive(false);
    expect(tracker.takePendingMs()).toBe(4_000);
  });

  it("激活中 take 后继续从当前时刻计时", () => {
    const { tracker, advance } = createTracker();
    tracker.setActive(true);
    advance(3_000);
    expect(tracker.takePendingMs()).toBe(3_000);
    advance(2_000);
    expect(tracker.takePendingMs()).toBe(2_000);
  });
});

describe("getPracticeTimeLevel", () => {
  it("按时长分档", () => {
    expect(getPracticeTimeLevel(0)).toBe(0);
    expect(getPracticeTimeLevel(-5)).toBe(0);
    expect(getPracticeTimeLevel(1)).toBe(1);
    expect(getPracticeTimeLevel(15 * 60 - 1)).toBe(1);
    expect(getPracticeTimeLevel(15 * 60)).toBe(2);
    expect(getPracticeTimeLevel(30 * 60)).toBe(3);
    expect(getPracticeTimeLevel(60 * 60)).toBe(4);
  });
});

describe("buildPracticeTimeWeeks", () => {
  it("生成指定周数、每周 7 天，首列为周日开头", () => {
    const end = new Date(2026, 7, 19); // 2026-08-19 周三
    const weeks = buildPracticeTimeWeeks(new Map(), end, 4);
    expect(weeks).toHaveLength(4);
    weeks.forEach((week) => expect(week).toHaveLength(7));
    expect(weeks[0][0]?.date).toBe("2026-07-26"); // 周日
    expect(weeks[3][3]?.date).toBe("2026-08-19");
    expect(weeks[3][4]).toBeNull(); // 未来日期留空
  });

  it("填充秒数与档位，缺失日期为 0", () => {
    const end = new Date(2026, 7, 19);
    const weeks = buildPracticeTimeWeeks(
      new Map([["2026-08-19", 40 * 60]]),
      end,
      2
    );
    expect(weeks[1][3]).toEqual({
      date: "2026-08-19",
      seconds: 40 * 60,
      level: 3,
    });
    expect(weeks[1][2]).toEqual({ date: "2026-08-18", seconds: 0, level: 0 });
  });
});

describe("getPracticeTimeMonthLabels", () => {
  it("每月 1 日所在周生成月份标签", () => {
    const weeks = buildPracticeTimeWeeks(new Map(), new Date(2026, 7, 19), 4);
    const labels = getPracticeTimeMonthLabels(weeks);
    expect(labels).toEqual([{ weekIndex: 1, month: 8 }]);
  });

  it("跨月时每周至多一个标签且按周递增", () => {
    const weeks = buildPracticeTimeWeeks(new Map(), new Date(2026, 9, 15), 12);
    const labels = getPracticeTimeMonthLabels(weeks);
    expect(labels.map((l) => l.month)).toEqual([8, 9, 10]);
    expect(labels.map((l) => l.weekIndex)).toEqual(
      [...labels.map((l) => l.weekIndex)].sort((a, b) => a - b)
    );
  });
});

describe("formatPracticeDuration", () => {
  it("中文：不足一分钟显示秒", () => {
    expect(formatPracticeDuration(45, "zh")).toBe("45秒");
  });

  it("中文：不足一小时显示分钟", () => {
    expect(formatPracticeDuration(599, "zh")).toBe("9分钟");
  });

  it("中文：超过一小时显示小时和分钟", () => {
    expect(formatPracticeDuration(3_900, "zh")).toBe("1小时5分钟");
  });

  it("英文：不足一分钟显示秒", () => {
    expect(formatPracticeDuration(45, "en")).toBe("45s");
  });

  it("英文：不足一小时显示分钟", () => {
    expect(formatPracticeDuration(599, "en")).toBe("9m");
  });

  it("英文：超过一小时显示小时和分钟", () => {
    expect(formatPracticeDuration(3_900, "en")).toBe("1h 5m");
  });

  it("负数按 0 处理", () => {
    expect(formatPracticeDuration(-10, "zh")).toBe("0秒");
  });
});
