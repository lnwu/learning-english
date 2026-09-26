import { describe, it, expect } from "bun:test";
import {
  MASTERY_LEVELS,
  MASTERY_LEVEL_ORDER,
  getMasteryLevel,
  getMasteryLevelCeiling,
  getMasteryLevelIndex,
} from "./masteryLevels";
import { translations } from "./i18n";

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

describe("getMasteryLevelCeiling", () => {
  it("返回该等级可达到的最高分", () => {
    expect(getMasteryLevelCeiling("new")).toBe(19);
    expect(getMasteryLevelCeiling("learning")).toBe(39);
    expect(getMasteryLevelCeiling("familiar")).toBe(59);
    expect(getMasteryLevelCeiling("proficient")).toBe(79);
    expect(getMasteryLevelCeiling("mastered")).toBe(100);
  });

  it("封顶分数仍落在对应等级内，且再加 1 分即进入下一级", () => {
    MASTERY_LEVELS.forEach((level, index) => {
      const ceiling = getMasteryLevelCeiling(level.key);
      expect(getMasteryLevel(ceiling)).toBe(level.key);
      const next = MASTERY_LEVELS[index + 1];
      if (next) {
        expect(ceiling).toBeLessThan(next.min);
        expect(getMasteryLevel(ceiling + 1)).toBe(next.key);
      }
    });
  });
});

describe("MASTERY_LEVELS", () => {
  it("门槛从 0 起严格递增", () => {
    expect(MASTERY_LEVELS[0].min).toBe(0);
    MASTERY_LEVELS.forEach((level, index) => {
      if (index === 0) return;
      expect(level.min).toBeGreaterThan(MASTERY_LEVELS[index - 1].min);
    });
  });

  it("顺序与 MASTERY_LEVEL_ORDER 一致", () => {
    expect(MASTERY_LEVEL_ORDER).toEqual(MASTERY_LEVELS.map((level) => level.key));
  });

  it("每个等级都有中英文文案", () => {
    MASTERY_LEVELS.forEach(({ labelKey }) => {
      expect(translations.zh[labelKey]).toBeTruthy();
      expect(translations.en[labelKey]).toBeTruthy();
    });
  });
});
