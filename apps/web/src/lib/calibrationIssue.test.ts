import { describe, expect, it } from "bun:test";
import {
  CALIBRATION_ISSUE_COOLDOWN_DAYS,
  formatCalibrationIssue,
  planCalibrationIssue,
  type CalibrationIssuePlan,
  type CalibrationIssueReport,
  type CalibrationIssueState,
} from "@/lib/calibrationIssue";
import { DAY_MS } from "@/lib/time";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");

const makeReport = (overrides: Partial<CalibrationIssueReport> = {}): CalibrationIssueReport => ({
  samples: 620,
  brier: 0.0793,
  auc: 0.6863,
  skippedNoPrediction: 186,
  skippedSameDay: 863,
  buckets: [
    { from: 0, to: 0.6, count: 12, meanPredicted: 0.561, observedRecall: 0.833, gap: 0.273 },
  ],
  meetsThreshold: true,
  ...overrides,
});

const plan = (
  issues: CalibrationIssueState[],
  options: {
    report?: CalibrationIssueReport;
    runUrl?: string | null;
    cooldownDays?: number;
  } = {},
): CalibrationIssuePlan =>
  planCalibrationIssue({
    report: options.report ?? makeReport(),
    issues,
    now: NOW,
    runUrl: options.runUrl ?? null,
    cooldownDays: options.cooldownDays,
  });

const expCreate = (result: CalibrationIssuePlan) => {
  if (result.action !== "create") throw new Error(`expected create, got ${result.action}`);
  return result;
};

const expUpdate = (result: CalibrationIssuePlan) => {
  if (result.action !== "update") throw new Error(`expected update, got ${result.action}`);
  return result;
};

const expCooldown = (result: CalibrationIssuePlan) => {
  if (result.action !== "skip-cooldown")
    throw new Error(`expected skip-cooldown, got ${result.action}`);
  return result;
};

describe("planCalibrationIssue", () => {
  it("样本未达门槛时跳过", () => {
    expect(plan([], { report: makeReport({ samples: 120, meetsThreshold: false }) })).toEqual({
      action: "skip-below-threshold",
      samples: 120,
    });
  });

  it("没有历史 Issue 时创建", () => {
    const result = expCreate(plan([]));
    expect(result.title).toBe("熟练度校准样本已达标（620 条）");
    expect(result.body).toContain("## 熟练度校准样本已达标");
  });

  it("有未关闭 Issue 时更新编号最小的那个", () => {
    const result = expUpdate(
      plan([
        { number: 240, state: "OPEN", closedAt: null },
        { number: 231, state: "OPEN", closedAt: null },
      ]),
    );
    expect(result.number).toBe(231);
  });

  it("更新标题随样本数变化", () => {
    const issues: CalibrationIssueState[] = [{ number: 231, state: "OPEN", closedAt: null }];
    const first = expUpdate(plan(issues));
    const second = expUpdate(plan(issues, { report: makeReport({ samples: 720 }) }));
    expect(first.title).toBe("熟练度校准样本已达标（620 条）");
    expect(second.title).toBe("熟练度校准样本已达标（720 条）");
    expect(first.body).not.toBe(second.body);
  });

  it("关闭不足冷却期时跳过并给出重开时间", () => {
    const closedAt = new Date(NOW - 27.9 * DAY_MS).toISOString();
    const result = expCooldown(plan([{ number: 231, state: "CLOSED", closedAt }]));
    expect(result.number).toBe(231);
    expect(result.reopenAt).toBe(Date.parse(closedAt) + CALIBRATION_ISSUE_COOLDOWN_DAYS * DAY_MS);
    expect(result.daysLeft).toBe(1);
  });

  it("恰好关闭 28 天时允许创建", () => {
    const closedAt = new Date(NOW - 28 * DAY_MS).toISOString();
    expect(expCreate(plan([{ number: 231, state: "CLOSED", closedAt }])).title).toContain("620");
  });

  it("关闭 29 天时允许创建", () => {
    const closedAt = new Date(NOW - 29 * DAY_MS).toISOString();
    expect(expCreate(plan([{ number: 231, state: "CLOSED", closedAt }])).title).toContain("620");
  });

  it("closedAt 为 null 时不作为冷却依据", () => {
    const result = expCreate(plan([{ number: 231, state: "CLOSED", closedAt: null }]));
    expect(result.action).toBe("create");
  });
});

describe("formatCalibrationIssue", () => {
  it("写入运行链接、数据区间、模型版本与拟合发布说明", () => {
    const { body } = formatCalibrationIssue({
      report: makeReport({
        modelVersion: "fsrs-6",
        dataFrom: "2026-01-01",
        dataTo: "2026-06-30",
      }),
      runUrl: "https://example.com/run/1",
    });

    for (const expected of [
      "- 本次运行：[https://example.com/run/1](https://example.com/run/1)",
      "- 数据区间：`2026-01-01 → 2026-06-30`（UTC）",
      "- 生效模型版本：`fsrs-6`",
      "| 0.00–0.60 | 12 | 0.561 | 0.833 | +0.273 |",
      "`uv venv --python 3.13`",
      "fsrs-optimizer==6.5.0",
      ".fsrs_optimizer",
      "evaluation.json",
      "calibrate:replay",
      "0 mismatch",
      "≥300",
      "≥1%",
      "≤0.01",
      "0.7–1.4",
      "docs/DEPLOYMENT.md",
    ]) {
      expect(body).toContain(expected);
    }
  });

  it("缺少可选字段时不输出对应行与 undefined", () => {
    const { body } = formatCalibrationIssue({ report: makeReport(), runUrl: null });
    expect(body).not.toContain("undefined");
    expect(body).not.toContain("- 本次运行：");
    expect(body).not.toContain("数据区间");
    expect(body).not.toContain("生效模型版本");
  });

  it("指标缺失时输出无", () => {
    const { body } = formatCalibrationIssue({
      report: makeReport({ brier: null, auc: null }),
      runUrl: null,
    });
    expect(body).toContain("- Brier：无，AUC：无");
  });
});
