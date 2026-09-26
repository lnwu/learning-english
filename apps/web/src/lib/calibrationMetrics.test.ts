import { describe, expect, it } from "bun:test";
import {
  DAY_MS,
  brierScore,
  buildCalibrationReport,
  buildCalibrationSamples,
  calibrationBuckets,
  rocAuc,
  type ReviewLogLike,
} from "@/lib/calibrationMetrics";

const MINUTE_MS = 60 * 1000;

const card = (reviews: Array<Partial<ReviewLogLike> & { at: number }>): ReviewLogLike[] =>
  reviews.map((review) => ({
    g: 3,
    r: 0.9,
    ...review,
  }));

describe("buildCalibrationSamples", () => {
  it("排除首次复习与同日复习，保留跨天样本", () => {
    const start = 1_000_000;
    const { samples, skippedNoPrediction, skippedSameDay } = buildCalibrationSamples([
      card([
        { at: start, g: 3, r: null },
        { at: start + 10 * MINUTE_MS, g: 3, r: 1 },
        { at: start + 2 * DAY_MS, g: 3, r: 0.9 },
        { at: start + 2 * DAY_MS + DAY_MS, g: 1, r: 0.85 },
      ]),
    ]);

    expect(samples).toHaveLength(2);
    expect(samples[0]).toEqual({ predicted: 0.9, recalled: true });
    expect(samples[1]).toEqual({ predicted: 0.85, recalled: false });
    expect(skippedNoPrediction).toBe(1);
    expect(skippedSameDay).toBe(1);
  });

  it("预测值夹取到 0–1", () => {
    const { samples } = buildCalibrationSamples([
      card([
        { at: 0, g: 3, r: null },
        { at: DAY_MS, g: 3, r: 1.2 },
      ]),
    ]);

    expect(samples[0].predicted).toBe(1);
  });
});

describe("brierScore", () => {
  it("按均方误差计算", () => {
    expect(
      brierScore([
        { predicted: 0.9, recalled: true },
        { predicted: 0.8, recalled: false },
      ]),
    ).toBeCloseTo(0.325, 6);
    expect(brierScore([])).toBeNull();
  });
});

describe("rocAuc", () => {
  it("排序完美为 1，完全反序为 0", () => {
    expect(
      rocAuc([
        { predicted: 0.9, recalled: true },
        { predicted: 0.8, recalled: false },
      ]),
    ).toBe(1);
    expect(
      rocAuc([
        { predicted: 0.8, recalled: true },
        { predicted: 0.9, recalled: false },
      ]),
    ).toBe(0);
  });

  it("并列预测值取平均秩，单类样本返回 null", () => {
    expect(
      rocAuc([
        { predicted: 0.9, recalled: true },
        { predicted: 0.9, recalled: false },
      ]),
    ).toBe(0.5);
    expect(rocAuc([{ predicted: 0.9, recalled: true }])).toBeNull();
  });
});

describe("calibrationBuckets", () => {
  it("按区间统计预测均值、实际回忆率与偏差", () => {
    const buckets = calibrationBuckets(
      [
        { predicted: 0.2, recalled: true },
        { predicted: 0.7, recalled: false },
        { predicted: 0.9, recalled: true },
      ],
      [0, 0.5, 1],
    );

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      count: 1,
      meanPredicted: 0.2,
      observedRecall: 1,
    });
    expect(buckets[0].gap).toBeCloseTo(0.8, 6);
    expect(buckets[1]).toMatchObject({ count: 2, observedRecall: 0.5 });
    expect(buckets[1].gap).toBeCloseTo(-0.3, 6);
  });

  it("空区间不出现在结果里", () => {
    expect(calibrationBuckets([{ predicted: 0.9, recalled: true }], [0, 0.5, 1])).toHaveLength(1);
  });
});

describe("buildCalibrationReport", () => {
  it("汇总样本、指标与门槛判断", () => {
    const report = buildCalibrationReport(
      [
        card([
          { at: 0, g: 3, r: null },
          { at: DAY_MS, g: 3, r: 0.9 },
          { at: 3 * DAY_MS, g: 1, r: 0.8 },
        ]),
      ],
      { minSamples: 2 },
    );

    expect(report.totalReviews).toBe(3);
    expect(report.samples).toBe(2);
    expect(report.brier).not.toBeNull();
    expect(report.auc).toBe(1);
    expect(report.meetsThreshold).toBe(true);
  });

  it("样本不足时门槛为 false", () => {
    const report = buildCalibrationReport([], { minSamples: 2 });
    expect(report.meetsThreshold).toBe(false);
    expect(report.brier).toBeNull();
  });
});
