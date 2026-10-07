import { describe, it, expect } from "bun:test";
import {
  DEFAULT_DAILY_GOAL_MINUTES,
  MAX_DAILY_GOAL_MINUTES,
  MIN_DAILY_GOAL_MINUTES,
  normalizeDailyGoalMinutes,
} from "./dailyGoal";

describe("normalizeDailyGoalMinutes", () => {
  it("保留区间内的整数分钟", () => {
    expect(normalizeDailyGoalMinutes(45)).toBe(45);
  });

  it("小数四舍五入", () => {
    expect(normalizeDailyGoalMinutes(29.6)).toBe(30);
  });

  it("非数字回退默认值", () => {
    expect(normalizeDailyGoalMinutes(undefined)).toBe(DEFAULT_DAILY_GOAL_MINUTES);
    expect(normalizeDailyGoalMinutes(null)).toBe(DEFAULT_DAILY_GOAL_MINUTES);
    expect(normalizeDailyGoalMinutes("30")).toBe(DEFAULT_DAILY_GOAL_MINUTES);
    expect(normalizeDailyGoalMinutes(Number.NaN)).toBe(DEFAULT_DAILY_GOAL_MINUTES);
    expect(normalizeDailyGoalMinutes(Number.POSITIVE_INFINITY)).toBe(DEFAULT_DAILY_GOAL_MINUTES);
  });

  it("越界值夹取到区间边界", () => {
    expect(normalizeDailyGoalMinutes(0)).toBe(MIN_DAILY_GOAL_MINUTES);
    expect(normalizeDailyGoalMinutes(-20)).toBe(MIN_DAILY_GOAL_MINUTES);
    expect(normalizeDailyGoalMinutes(1000)).toBe(MAX_DAILY_GOAL_MINUTES);
  });
});
