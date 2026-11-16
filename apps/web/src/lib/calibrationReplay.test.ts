import { describe, expect, it } from "bun:test";
import {
  buildCalibrationReport,
  calibrationObservations,
  type CalibrationObservation,
  type ReviewLogLike,
} from "@/lib/calibrationMetrics";
import {
  REPLAY_MAX_INTERVAL_RATIO,
  REPLAY_MIN_INTERVAL_RATIO,
  applyRevert,
  buildFitCsv,
  compareHoldout,
  evaluateReplayGate,
  holdoutCutoff,
  pairedDifference,
  replayCards,
  summarizeObservations,
  type ReplayMetrics,
  type ReplayReview,
} from "@/lib/calibrationReplay";
import { FSRS6_DEFAULT_WEIGHTS, MODEL_WEIGHTS, type Rating } from "@/lib/masteryModel";
import { DAY_MS, MINUTE_MS } from "@/lib/time";

const HOUR_MS = 60 * MINUTE_MS;

const FIXTURE: ReplayReview[] = [
  { at: 1790434970246, g: 3, r: null, s: 2.3065, d: 2.118103970459015 },
  { at: 1790438323831, g: 3, r: 1, s: 2.3065, d: 2.11121424 },
  { at: 1790442174009, g: 3, r: 1, s: 2.3065, d: 2.1043314 },
  { at: 1790585635357, g: 3, r: 0.9468475, s: 7.32306756, d: 2.09745544 },
];

const CANDIDATE = MODEL_WEIGHTS.map((value, index) => (index === 20 ? value * 1.5 : value));

const predictionsOf = (result: ReturnType<typeof replayCards>): Array<number | null> =>
  result.cards.flatMap((card) => card.reviews.map((review) => review.r));

describe("replayCards", () => {
  it("锚定模式复现存储的预测值", () => {
    const result = replayCards([{ reviews: FIXTURE }]);
    expect(result.integrity).toEqual({
      predictions: 3,
      exact: 3,
      near: 0,
      mismatched: 0,
      maxDelta: 0,
      anchored: true,
      skippedFirst: 0,
    });
    const predictions = predictionsOf(result);
    expect(predictions).toHaveLength(FIXTURE.length);
    expect(predictions[0]).toBeNull();
    for (let index = 1; index < FIXTURE.length; index++) {
      expect(predictions[index]).toBe(FIXTURE[index].r);
    }
    expect(result.memories[0]).toHaveLength(FIXTURE.length);
    expect(result.memories[0].map((memory) => memory.stability)).toEqual([
      2.3065, 2.3065, 2.3065, 7.32306756,
    ]);
    expect(result.memories[0].map((memory) => memory.difficulty)).toEqual([
      2.118103970459015, 2.11121424, 2.1043314, 2.09745544,
    ]);
  });

  it("缺少 s/d 时回退模式同样复现预测值", () => {
    const stripped: ReplayReview[] = FIXTURE.map(({ at, g, r }) => ({ at, g, r }));
    const result = replayCards([{ reviews: stripped }]);
    expect(result.integrity).toEqual({
      predictions: 3,
      exact: 3,
      near: 0,
      mismatched: 0,
      maxDelta: 0,
      anchored: false,
      skippedFirst: 0,
    });
    const predictions = predictionsOf(result);
    expect(predictions[0]).toBeNull();
    for (let index = 1; index < FIXTURE.length; index++) {
      expect(predictions[index]).toBe(FIXTURE[index].r);
    }
  });

  it("switchAt 之前沿用基线权重，之后切到候选权重", () => {
    const baseline = replayCards([{ reviews: FIXTURE }]);
    const switched = replayCards([{ reviews: FIXTURE }], {
      before: MODEL_WEIGHTS,
      after: CANDIDATE,
      switchAt: FIXTURE[2].at,
    });
    const baselinePredictions = predictionsOf(baseline);
    const switchedPredictions = predictionsOf(switched);

    expect(switchedPredictions[0]).toBeNull();
    expect(switchedPredictions[1]).toBe(baselinePredictions[1]);
    expect(switchedPredictions[2]).toBe(baselinePredictions[2]);
    expect(switchedPredictions[3]).not.toBe(baselinePredictions[3]);
    expect(switched.memories[0][3].stability).not.toBe(baseline.memories[0][3].stability);
  });

  it("compareHoldout 两侧 holdout 样本键一致", () => {
    const comparison = compareHoldout({
      cards: [{ reviews: FIXTURE }],
      cutoff: FIXTURE[2].at,
      candidate: CANDIDATE,
    });

    expect(comparison.cutoff).toBe(FIXTURE[2].at);
    expect(comparison.baseline.holdout.samples).toBeGreaterThan(0);
    expect(comparison.candidate.holdout.samples).toBe(comparison.baseline.holdout.samples);
    expect(comparison.paired.count).toBe(comparison.baseline.holdout.samples);
    expect(comparison.baseline.full.samples).toBeGreaterThanOrEqual(
      comparison.baseline.holdout.samples,
    );
    expect(comparison.intervalShift.p50).not.toBeNull();
    expect(comparison.gate.checks.samples).toBe(false);
    expect(comparison.integrity.mismatched).toBe(0);
  });

  it("存储的复习 id 不影响 interval 比值", () => {
    const start = 1_700_000_000_000;
    const cards = [0, 1].map((cardIndex) => ({
      reviews: [0, 1, 2].map((reviewIndex) => ({
        at: start + cardIndex * 7 * DAY_MS + reviewIndex * 3 * DAY_MS,
        g: 3 as Rating,
        r: reviewIndex === 0 ? null : 0.9,
        id: `${1790434968000 + cardIndex * 10 + reviewIndex}_ab12cd34`,
      })),
    }));

    const comparison = compareHoldout({
      cards,
      cutoff: start + 3 * DAY_MS,
      candidate: CANDIDATE,
    });

    expect(comparison.baseline.holdout.samples).toBe(4);
    expect(comparison.paired.count).toBe(4);
    const ratio = comparison.intervalShift.p50;
    expect(ratio).not.toBeNull();
    if (ratio !== null) {
      expect(comparison.gate.checks.interval).toBe(
        ratio >= REPLAY_MIN_INTERVAL_RATIO && ratio <= REPLAY_MAX_INTERVAL_RATIO,
      );
    }
  });

  it("首条复习已有预测值时计入 skippedFirst", () => {
    const truncated = FIXTURE.slice(1);
    const result = replayCards([{ reviews: truncated }]);
    expect(result.integrity.skippedFirst).toBe(1);
    expect(result.integrity.predictions).toBe(truncated.length - 1);
    expect(result.integrity.mismatched).toBe(0);
  });
});

describe("holdoutCutoff", () => {
  it("按整天对齐最后复习时间往前推", () => {
    const maxAt = 1_700_000_000_000;
    const cutoff = holdoutCutoff([{ reviews: [{ at: maxAt, g: 3, r: 1 }] }], 3);
    expect(cutoff).toBe(Math.floor((maxAt - 3 * DAY_MS) / DAY_MS) * DAY_MS);
    expect(cutoff % DAY_MS).toBe(0);
    expect(holdoutCutoff([])).toBe(0);
  });
});

describe("buildFitCsv", () => {
  const t0 = 1_700_000_000_000;
  const anchor = Math.floor(t0 / DAY_MS) * DAY_MS;
  const dataRows = (csv: string): string[] => csv.split("\n").slice(1);

  it("23 小时间隔同日，25 小时间隔跨天", () => {
    const { csv } = buildFitCsv([
      {
        cardId: "a",
        reviews: [
          { at: t0, g: 3, r: null },
          { at: t0 + 23 * HOUR_MS, g: 3, r: 1 },
          { at: t0 + 23 * HOUR_MS + 25 * HOUR_MS, g: 2, r: 0.9 },
        ],
      },
    ]);
    expect(csv.split("\n")[0]).toBe("card_id,review_time,review_rating");
    expect(dataRows(csv).map((row) => Number(row.split(",")[1]))).toEqual([
      anchor + 12 * HOUR_MS,
      anchor + 12 * HOUR_MS + 1,
      anchor + DAY_MS + 12 * HOUR_MS + 2,
    ]);
  });

  it("一小时与一天混合的日差为 0/0/1", () => {
    const { csv, rows, cards } = buildFitCsv([
      {
        reviews: [
          { at: t0, g: 3, r: null },
          { at: t0 + HOUR_MS, g: 1, r: 1 },
          { at: t0 + 25 * HOUR_MS, g: 3, r: 0.5 },
        ],
      },
    ]);
    expect(rows).toBe(3);
    expect(cards).toBe(1);
    expect(dataRows(csv).map((row) => Number(row.split(",")[1]))).toEqual([
      anchor + 12 * HOUR_MS,
      anchor + 12 * HOUR_MS + 1,
      anchor + DAY_MS + 12 * HOUR_MS + 2,
    ]);
  });

  it("cutoff 截断跨天的复习", () => {
    const { csv, rows } = buildFitCsv(
      [
        {
          cardId: "a",
          reviews: [
            { at: t0, g: 3, r: null },
            { at: t0 + HOUR_MS, g: 3, r: 1 },
            { at: t0 + 25 * HOUR_MS, g: 3, r: 0.9 },
          ],
        },
      ],
      { cutoff: t0 + 2 * HOUR_MS },
    );
    expect(rows).toBe(2);
    expect(dataRows(csv)).toEqual([
      `a,${anchor + 12 * HOUR_MS},3`,
      `a,${anchor + 12 * HOUR_MS + 1},3`,
    ]);
  });

  it("按卡片与合成时间排序，缺失 cardId 用下标补位", () => {
    const { csv, rows, cards } = buildFitCsv([
      {
        cardId: "b",
        reviews: [
          { at: t0 + 2 * HOUR_MS, g: 1, r: null },
          { at: t0 + 3 * HOUR_MS, g: 2, r: 1 },
        ],
      },
      { reviews: [{ at: t0, g: 3, r: null }] },
      { cardId: "a", reviews: [{ at: t0, g: 3, r: null }] },
    ]);
    expect(rows).toBe(4);
    expect(cards).toBe(3);
    expect(csv.split("\n").map((row) => row.split(",")[0])).toEqual([
      "card_id",
      "a",
      "b",
      "b",
      "card_1",
    ]);
    expect(buildFitCsv([{ cardId: "x", reviews: [] }])).toEqual({
      csv: "card_id,review_time,review_rating",
      rows: 0,
      cards: 0,
    });
  });
});

const metrics = (samples: number, brier: number | null, auc: number | null): ReplayMetrics => ({
  samples,
  brier,
  auc,
  ece: 0.02,
  constantBrier: 0.16,
  predictedMean: 0.9,
  observedRecall: 0.8,
  buckets: [],
});

describe("evaluateReplayGate", () => {
  it("指标达标时通过", () => {
    const gate = evaluateReplayGate(metrics(500, 0.1, 0.68), metrics(500, 0.09, 0.685), 1);
    expect(gate.pass).toBe(true);
    expect(gate.checks).toEqual({ samples: true, brier: true, auc: true, interval: true });
    expect(gate.reasons).toEqual([]);
    expect(gate.brierGain).toBeCloseTo(0.1, 12);
    expect(gate.aucDelta).toBeCloseTo(0.005, 12);
    expect(gate.intervalP50Ratio).toBe(1);
  });

  it("样本不足时失败", () => {
    const gate = evaluateReplayGate(metrics(500, 0.1, 0.68), metrics(299, 0.09, 0.685), 1);
    expect(gate.pass).toBe(false);
    expect(gate.checks.samples).toBe(false);
    expect(gate.reasons).toHaveLength(1);
    expect(gate.reasons[0]).toContain("299");
  });

  it("Brier 提升不足时失败", () => {
    const gate = evaluateReplayGate(metrics(500, 0.1, 0.68), metrics(500, 0.0995, 0.685), 1);
    expect(gate.pass).toBe(false);
    expect(gate.checks.brier).toBe(false);
    expect(gate.reasons).toHaveLength(1);
    expect(gate.reasons[0]).toContain("Brier");
  });

  it("AUC 下降过多时失败", () => {
    const gate = evaluateReplayGate(metrics(500, 0.1, 0.68), metrics(500, 0.09, 0.66), 1);
    expect(gate.pass).toBe(false);
    expect(gate.checks.auc).toBe(false);
    expect(gate.reasons).toHaveLength(1);
    expect(gate.reasons[0]).toContain("AUC");
  });

  it("间隔比值越界时失败", () => {
    const low = evaluateReplayGate(metrics(500, 0.1, 0.68), metrics(500, 0.09, 0.685), 0.6);
    const high = evaluateReplayGate(metrics(500, 0.1, 0.68), metrics(500, 0.09, 0.685), 1.5);
    expect(low.checks.interval).toBe(false);
    expect(high.checks.interval).toBe(false);
    expect(low.pass).toBe(false);
    expect(high.reasons[0]).toContain("间隔");
  });

  it("指标缺失时对应检查失败", () => {
    const gate = evaluateReplayGate(metrics(500, null, 0.68), metrics(500, null, null), null);
    expect(gate.pass).toBe(false);
    expect(gate.checks).toEqual({ samples: true, brier: false, auc: false, interval: false });
    expect(gate.brierGain).toBeNull();
    expect(gate.aucDelta).toBeNull();
    expect(gate.reasons).toHaveLength(3);
  });
});

const observation = (
  reviewId: string,
  predicted: number,
  recalled: boolean,
): CalibrationObservation => ({
  cardId: "c",
  cardIndex: 0,
  reviewIndex: 0,
  reviewId,
  at: 1,
  predicted,
  recalled,
});

describe("pairedDifference", () => {
  it("候选更好时差值为正", () => {
    const baseline = [observation("1", 0.5, true), observation("2", 0.8, false)];
    const candidate = [observation("1", 0.9, true), observation("2", 0.2, false)];
    const paired = pairedDifference(baseline, candidate);
    expect(paired.count).toBe(2);
    expect(paired.mean).toBeCloseTo(0.42, 12);
    expect(paired.se).toBeCloseTo(0.18, 12);
    expect(paired.lower).toBeCloseTo(0.42 - 1.96 * 0.18, 12);
    expect(paired.upper).toBeCloseTo(0.42 + 1.96 * 0.18, 12);
  });

  it("候选更差时差值为负", () => {
    const baseline = [observation("1", 0.9, true), observation("2", 0.2, false)];
    const candidate = [observation("1", 0.5, true), observation("2", 0.8, false)];
    const paired = pairedDifference(baseline, candidate);
    expect(paired.mean).toBeCloseTo(-0.42, 12);
    expect(paired.upper).toBeLessThan(0);
  });

  it("键集合不一致时抛错", () => {
    const baseline = [observation("1", 0.5, true), observation("2", 0.8, false)];
    const missing = [observation("1", 0.5, true), observation("3", 0.8, false)];
    expect(() => pairedDifference(baseline, missing)).toThrow(Error);
    expect(() => pairedDifference(baseline, baseline.slice(0, 1))).toThrow(Error);
    expect(() => pairedDifference([], [observation("1", 0.5, true)])).toThrow(Error);
  });

  it("空输入返回空结果", () => {
    expect(pairedDifference([], [])).toEqual({
      count: 0,
      mean: null,
      se: null,
      lower: null,
      upper: null,
    });
  });
});

describe("applyRevert", () => {
  const weights = MODEL_WEIGHTS.map((value) => value * 2);

  it("替换指定下标并保留其余值", () => {
    const reverted = applyRevert(weights, [1, 15]);
    expect(reverted).not.toBe(weights);
    expect(reverted).toHaveLength(weights.length);
    expect(reverted[1]).toBe(FSRS6_DEFAULT_WEIGHTS[1]);
    expect(reverted[15]).toBe(FSRS6_DEFAULT_WEIGHTS[15]);
    expect(reverted[0]).toBe(weights[0]);
    expect(weights[1]).toBe(MODEL_WEIGHTS[1] * 2);
  });

  it("下标越界时抛 RangeError", () => {
    expect(() => applyRevert(weights, [21])).toThrow(RangeError);
    expect(() => applyRevert(weights, [-1])).toThrow(RangeError);
    expect(() => applyRevert(weights, [1.5])).toThrow(RangeError);
    expect(weights).toHaveLength(MODEL_WEIGHTS.length);
  });
});

describe("summarizeObservations", () => {
  const cards: ReviewLogLike[][] = Array.from({ length: 6 }, (_, cardIndex) =>
    Array.from({ length: 6 }, (_, reviewIndex) => ({
      at: 1_700_000_000_000 + cardIndex * DAY_MS + reviewIndex * 2 * DAY_MS,
      g: (reviewIndex % 3 === 0 ? 1 : 3) as Rating,
      r: reviewIndex === 0 ? null : 0.55 + 0.07 * (reviewIndex % 5),
    })),
  );

  it("与 buildCalibrationReport 的 samples/brier/auc 一致", () => {
    const report = buildCalibrationReport(cards);
    const { observations } = calibrationObservations(cards);
    const summary = summarizeObservations(observations);

    expect(summary.samples).toBe(report.samples);
    expect(summary.samples).toBeGreaterThan(0);
    expect(report.brier).not.toBeNull();
    expect(report.auc).not.toBeNull();
    expect(summary.brier).toBe(report.brier);
    expect(summary.auc).toBe(report.auc);
    expect(summary.buckets).toEqual(report.buckets);
    expect(summary.buckets.length).toBeLessThanOrEqual(6);
    const ece = summary.ece;
    expect(ece).not.toBeNull();
    if (ece !== null) {
      expect(ece).toBeGreaterThanOrEqual(0);
      expect(ece).toBeLessThanOrEqual(1);
    }
  });

  it("观察值与样本统计一致", () => {
    const { observations } = calibrationObservations(cards);
    const summary = summarizeObservations(observations);
    const recalled = observations.filter((item) => item.recalled).length;
    const observed = recalled / observations.length;
    expect(summary.observedRecall).toBeCloseTo(observed, 12);
    expect(summary.constantBrier).toBeCloseTo(observed * (1 - observed), 12);
  });

  it("空输入返回空指标", () => {
    expect(summarizeObservations([])).toEqual({
      samples: 0,
      brier: null,
      auc: null,
      ece: null,
      constantBrier: null,
      predictedMean: null,
      observedRecall: null,
      buckets: [],
    });
  });
});
