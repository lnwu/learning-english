import { describe, it, expect } from "bun:test";
import { averageMasteryScore, masteryDistribution } from "./masteryStats";

describe("averageMasteryScore", () => {
  it("空列表返回 0", () => {
    expect(averageMasteryScore([])).toBe(0);
  });

  it("返回四舍五入后的平均分", () => {
    expect(averageMasteryScore([{ masteryScore: 10 }, { masteryScore: 20 }])).toBe(15);
    expect(averageMasteryScore([{ masteryScore: 10 }, { masteryScore: 21 }])).toBe(16);
  });
});

describe("masteryDistribution", () => {
  it("按等级统计数量", () => {
    expect(
      masteryDistribution([
        { masteryScore: 0 },
        { masteryScore: 19 },
        { masteryScore: 40 },
        { masteryScore: 80 },
        { masteryScore: 100 },
      ]),
    ).toEqual({
      new: 2,
      learning: 0,
      familiar: 1,
      proficient: 0,
      mastered: 2,
    });
  });

  it("空列表返回全零", () => {
    expect(masteryDistribution([])).toEqual({
      new: 0,
      learning: 0,
      familiar: 0,
      proficient: 0,
      mastered: 0,
    });
  });
});
