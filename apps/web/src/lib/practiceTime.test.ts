import { describe, it, expect } from "bun:test";
import {
  PracticeTimeRecorder,
  buildPracticeTimeWeeks,
  formatPracticeDuration,
  formatPracticeMonthLabel,
  getPracticeTimeLevel,
  getPracticeTimeMonthLabels,
} from "./practiceTime";

describe("PracticeTimeRecorder", () => {
  const createRecorder = () => {
    let current = new Date(2026, 7, 19, 10, 0, 0).getTime();
    const writes: Array<{ dateId: string; seconds: number }> = [];
    let failing = false;
    const recorder = new PracticeTimeRecorder({
      now: () => current,
      writeSeconds: async (dateId, seconds) => {
        if (failing) throw new Error("write failed");
        writes.push({ dateId, seconds });
      },
    });

    return {
      recorder,
      writes,
      advance: (ms: number) => {
        current += ms;
      },
      advanceDays: (days: number) => {
        current += days * 24 * 60 * 60 * 1000;
      },
      setFailing: (value: boolean) => {
        failing = value;
      },
    };
  };

  it("激活期间累计整秒并在 flush 时写出，保留不足一秒的结余", async () => {
    const { recorder, writes, advance } = createRecorder();
    recorder.setActive(true);
    advance(5_400);

    await recorder.flush();

    expect(writes).toEqual([{ dateId: "2026-08-19", seconds: 5 }]);
  });

  it("非激活状态的时间不计入", async () => {
    const { recorder, writes, advance } = createRecorder();
    advance(10_000);

    await recorder.flush();

    expect(writes).toEqual([]);
  });

  it("激活/暂停切换时只累计激活分段时间", async () => {
    const { recorder, writes, advance } = createRecorder();
    recorder.setActive(true);
    advance(3_000);
    recorder.setActive(false);
    advance(10_000);
    recorder.setActive(true);
    advance(2_000);

    await recorder.flush();

    expect(writes).toEqual([{ dateId: "2026-08-19", seconds: 5 }]);
  });

  it("重复的 setActive 调用不产生副作用", async () => {
    const { recorder, writes, advance } = createRecorder();
    recorder.setActive(true);
    recorder.setActive(true);
    advance(4_000);
    recorder.setActive(false);
    recorder.setActive(false);

    await recorder.flush();

    expect(writes).toEqual([{ dateId: "2026-08-19", seconds: 4 }]);
  });

  it("不足一秒时不写出，结余累积到下次 flush", async () => {
    const { recorder, writes, advance } = createRecorder();
    recorder.setActive(true);
    advance(400);

    await recorder.flush();
    expect(writes).toEqual([]);

    advance(700);
    await recorder.flush();
    expect(writes).toEqual([{ dateId: "2026-08-19", seconds: 1 }]);
  });

  it("写出失败时把整秒放回池中，下次 flush 重试", async () => {
    const { recorder, writes, advance, setFailing } = createRecorder();
    recorder.setActive(true);
    advance(5_000);
    setFailing(true);

    await recorder.flush();
    expect(writes).toEqual([]);

    setFailing(false);
    await recorder.flush();
    expect(writes).toEqual([{ dateId: "2026-08-19", seconds: 5 }]);
  });

  it("flush 使用注入时钟当天的日期", async () => {
    const { recorder, writes, advance, advanceDays } = createRecorder();
    recorder.setActive(true);
    advance(3_000);
    recorder.setActive(false);
    advanceDays(1);

    await recorder.flush();

    expect(writes).toEqual([{ dateId: "2026-08-20", seconds: 3 }]);
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
    const weeks = buildPracticeTimeWeeks(new Map([["2026-08-19", 40 * 60]]), end, 2);
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
      [...labels.map((l) => l.weekIndex)].sort((a, b) => a - b),
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

describe("formatPracticeMonthLabel", () => {
  it("中文显示月份加月", () => {
    expect(formatPracticeMonthLabel(9, "zh")).toBe("9月");
  });

  it("英文显示月份缩写", () => {
    expect(formatPracticeMonthLabel(9, "en")).toBe("Sep");
    expect(formatPracticeMonthLabel(1, "en")).toBe("Jan");
  });
});
