import { describe, expect, it } from "bun:test";
import {
  calculateFluencyScore,
  effectiveLevel,
  FSRS6_DEFAULT_WEIGHTS,
  initialMemory,
  intervalDays,
  masteryScoreFor,
  MODEL_WEIGHTS,
  retrievability,
  reviewMemory,
  type WordMemory,
} from "@/lib/masteryModel";
import { DAY_MS, MINUTE_MS } from "@/lib/time";
import { makeStats } from "./testSupport";

const perturbedWeights = MODEL_WEIGHTS.map((value, index) =>
  index === 20 ? value * 1.2 : value * 1.05,
);

const memoryWith = (
  stability: number,
  state: WordMemory["state"] = "review",
  reps = 1,
): WordMemory => ({
  ...initialMemory(0),
  stability,
  difficulty: 5,
  state,
  reps,
  lastReviewAt: 0,
});

describe("reviewMemory", () => {
  it("新词首次独立答对进入学习步", () => {
    const start = 1_000_000;
    const memory = reviewMemory(initialMemory(start), 3, start);
    expect(memory.stability).toBeCloseTo(2.3065, 4);
    expect(memory.difficulty).toBeCloseTo(2.1181, 4);
    expect(memory.state).toBe("learning");
    expect(memory.learningSteps).toBe(1);
    expect(memory.due).toBe(start + 10 * MINUTE_MS);
    expect(memory.reps).toBe(1);
  });

  it("新词首次答错进入 1 分钟学习步", () => {
    const start = 1_000_000;
    const memory = reviewMemory(initialMemory(start), 1, start);
    expect(memory.stability).toBe(0.212);
    expect(memory.difficulty).toBeCloseTo(6.4133, 4);
    expect(memory.state).toBe("learning");
    expect(memory.learningSteps).toBe(0);
    expect(memory.due).toBe(start + 1 * MINUTE_MS);
  });

  it("同日再次答对毕业并按稳定度计算间隔", () => {
    const start = 1_000_000;
    const first = reviewMemory(initialMemory(start), 3, start);
    const second = reviewMemory(first, 3, start + 10 * MINUTE_MS);
    expect(second.stability).toBeCloseTo(2.3065, 4);
    expect(second.difficulty).toBeCloseTo(2.1112, 4);
    expect(second.state).toBe("review");
    expect(second.learningSteps).toBe(0);
    expect(second.due).toBe(start + 10 * MINUTE_MS + 2 * DAY_MS);
  });

  it("到期复习按遗忘曲线增长稳定度", () => {
    const start = Date.UTC(2026, 0, 1);
    const first = reviewMemory(initialMemory(start), 3, start);
    const graduated = reviewMemory(first, 3, start + 10 * MINUTE_MS);
    expect(graduated.due).toBe(start + 10 * MINUTE_MS + 2 * DAY_MS);
    expect(retrievability(graduated, graduated.due)).toBeCloseTo(0.909493, 5);

    const reviewed = reviewMemory(graduated, 3, graduated.due);
    expect(reviewed.stability).toBeCloseTo(10.971, 4);
    expect(reviewed.difficulty).toBeCloseTo(2.1043, 4);
    expect(reviewed.due).toBe(graduated.due + 11 * DAY_MS);
    expect(retrievability(reviewed, reviewed.due)).toBeCloseTo(0.899819, 5);

    const next = reviewMemory(reviewed, 3, reviewed.due);
    expect(next.stability).toBeCloseTo(46.317, 2);
    expect(next.due).toBe(reviewed.due + 46 * DAY_MS);
  });

  it("逾期答错按答错公式大幅回退并进入再学习步", () => {
    const start = Date.UTC(2026, 0, 1);
    const first = reviewMemory(initialMemory(start), 3, start);
    const graduated = reviewMemory(first, 3, start + 10 * MINUTE_MS);
    const reviewed = reviewMemory(graduated, 3, graduated.due);
    const lapseAt = reviewed.lastReviewAt! + 30 * DAY_MS;
    expect(retrievability(reviewed, lapseAt)).toBeCloseTo(0.817962, 5);

    const lapsed = reviewMemory(reviewed, 1, lapseAt);
    expect(lapsed.stability).toBeCloseTo(1.761326, 5);
    expect(lapsed.state).toBe("relearning");
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.due).toBe(lapseAt + 10 * MINUTE_MS);
  });

  it("首次复习前没有回忆概率", () => {
    expect(retrievability(initialMemory(0), 10 * DAY_MS)).toBeNull();
  });
});

describe("intervalDays", () => {
  it("按期望保留率 90% 取整", () => {
    expect(intervalDays(2.3065)).toBe(2);
    expect(intervalDays(10.971074)).toBe(11);
    expect(intervalDays(46.316896)).toBe(46);
    expect(intervalDays(0.2)).toBe(1);
  });
});

describe("权重", () => {
  it("默认权重长度 21 且全部有限", () => {
    expect(MODEL_WEIGHTS).toHaveLength(21);
    expect(FSRS6_DEFAULT_WEIGHTS).toHaveLength(21);
    for (const weight of [...MODEL_WEIGHTS, ...FSRS6_DEFAULT_WEIGHTS]) {
      expect(Number.isFinite(weight)).toBe(true);
    }
  });

  it("默认调用与显式传入 MODEL_WEIGHTS 结果一致", () => {
    const start = Date.UTC(2026, 0, 1);
    const implicitFirst = reviewMemory(initialMemory(start), 3, start);
    const explicitFirst = reviewMemory(initialMemory(start), 3, start, MODEL_WEIGHTS);
    expect(explicitFirst).toEqual(implicitFirst);

    const implicitGraduated = reviewMemory(implicitFirst, 3, start + 10 * MINUTE_MS);
    const explicitGraduated = reviewMemory(explicitFirst, 3, start + 10 * MINUTE_MS, MODEL_WEIGHTS);
    expect(explicitGraduated).toEqual(implicitGraduated);

    expect(retrievability(implicitGraduated, implicitGraduated.due, MODEL_WEIGHTS)).toBe(
      retrievability(implicitGraduated, implicitGraduated.due),
    );
    expect(intervalDays(2.3065, MODEL_WEIGHTS)).toBe(intervalDays(2.3065));
  });

  it("注入权重改变新词 Again 的初始稳定度与难度", () => {
    const base = reviewMemory(initialMemory(0), 1, 0);
    const custom = reviewMemory(initialMemory(0), 1, 0, perturbedWeights);
    expect(custom.stability).not.toBeCloseTo(base.stability, 8);
    expect(custom.difficulty).not.toBeCloseTo(base.difficulty, 8);
  });

  it("注入权重改变新词 Good 的初始稳定度与难度", () => {
    const base = reviewMemory(initialMemory(0), 3, 0);
    const custom = reviewMemory(initialMemory(0), 3, 0, perturbedWeights);
    expect(custom.stability).not.toBeCloseTo(base.stability, 8);
    expect(custom.difficulty).not.toBeCloseTo(base.difficulty, 8);
  });

  it("注入权重改变同日复习的短期稳定度", () => {
    const base = reviewMemory(memoryWith(2.3065), 1, 0);
    const custom = reviewMemory(memoryWith(2.3065), 1, 0, perturbedWeights);
    expect(custom.stability).not.toBeCloseTo(base.stability, 8);
  });

  it("注入权重改变跨天 Good 复习的回忆稳定度", () => {
    const base = reviewMemory(memoryWith(2.3065), 3, 10 * DAY_MS);
    const custom = reviewMemory(memoryWith(2.3065), 3, 10 * DAY_MS, perturbedWeights);
    expect(custom.stability).not.toBeCloseTo(base.stability, 8);
  });

  it("注入权重改变跨天 Again 复习的遗忘稳定度", () => {
    const base = reviewMemory(memoryWith(10.971), 1, 10 * DAY_MS);
    const custom = reviewMemory(memoryWith(10.971), 1, 10 * DAY_MS, perturbedWeights);
    expect(custom.stability).not.toBeCloseTo(base.stability, 8);
  });

  it("注入权重改变回忆概率，间隔乘数仍为 1", () => {
    expect(retrievability(memoryWith(2.3065), 5 * DAY_MS, perturbedWeights)).not.toBeCloseTo(
      retrievability(memoryWith(2.3065), 5 * DAY_MS)!,
      8,
    );
    expect(intervalDays(2.3, perturbedWeights)).toBe(2);
  });

  it("传入扰动向量不会修改 MODEL_WEIGHTS", () => {
    const before = [...MODEL_WEIGHTS];
    reviewMemory(initialMemory(0), 3, 0, perturbedWeights);
    reviewMemory(memoryWith(2.3065), 3, 10 * DAY_MS, perturbedWeights);
    retrievability(memoryWith(2.3065), 5 * DAY_MS, perturbedWeights);
    intervalDays(2.3, perturbedWeights);
    expect(MODEL_WEIGHTS).toEqual(before);
  });
});

describe("等级与分数", () => {
  it("按稳定度档位与复习日解锁取更严格者", () => {
    expect(effectiveLevel(memoryWith(2.3065), makeStats({ reviewDays: 1 }))).toBe("learning");
    expect(effectiveLevel(memoryWith(2.3065), makeStats({ reviewDays: 2 }))).toBe("familiar");
    expect(effectiveLevel(memoryWith(10.971), makeStats({ reviewDays: 2 }))).toBe("familiar");
    expect(effectiveLevel(memoryWith(10.971), makeStats({ reviewDays: 3 }))).toBe("proficient");
    expect(effectiveLevel(memoryWith(46.317), makeStats({ reviewDays: 3 }))).toBe("proficient");
    expect(effectiveLevel(memoryWith(46.317), makeStats({ reviewDays: 4 }))).toBe("mastered");
    expect(effectiveLevel(initialMemory(0), makeStats({ reviewDays: 0 }))).toBe("new");
  });

  it("分数按有效等级区间单调推进", () => {
    expect(masteryScoreFor(initialMemory(0), makeStats({ reviewDays: 0 }))).toBe(0);
    expect(masteryScoreFor(memoryWith(0.5), makeStats({ reviewDays: 1 }))).toBe(30);
    expect(masteryScoreFor(memoryWith(2.3065), makeStats({ reviewDays: 1 }))).toBe(39);
    expect(masteryScoreFor(memoryWith(2.3065), makeStats({ reviewDays: 2 }))).toBe(44);
    expect(masteryScoreFor(memoryWith(10.971), makeStats({ reviewDays: 2 }))).toBe(59);
    expect(masteryScoreFor(memoryWith(10.971), makeStats({ reviewDays: 3 }))).toBe(63);
    expect(masteryScoreFor(memoryWith(30), makeStats({ reviewDays: 4 }))).toBe(80);
    expect(masteryScoreFor(memoryWith(100), makeStats({ reviewDays: 10 }))).toBe(84);
    expect(masteryScoreFor(memoryWith(365), makeStats({ reviewDays: 10 }))).toBe(100);
    expect(masteryScoreFor(memoryWith(1.761326), makeStats({ reviewDays: 10 }))).toBe(42);
  });
});

describe("calculateFluencyScore", () => {
  it("基线速度对应 80 分，快 25% 封顶", () => {
    expect(calculateFluencyScore([2, 2, 2, 2, 2], 2)).toBe(80);
    expect(calculateFluencyScore([1.5, 1.5, 1.5, 1.6], 2)).toBe(100);
  });

  it("清洗异常值且样本不足返回 null", () => {
    expect(calculateFluencyScore([2, 2, 40], 2)).toBeNull();
    expect(calculateFluencyScore([2, 2], 2)).toBeNull();
    expect(calculateFluencyScore([4, 4, 4], 2)).toBe(40);
  });
});
