import { DAY_MS } from "@/lib/time";

export const CALIBRATION_ISSUE_LABEL = "calibration";
export const CALIBRATION_ISSUE_COOLDOWN_DAYS = 28;

export interface CalibrationIssueReport {
  samples: number;
  brier: number | null;
  auc: number | null;
  skippedNoPrediction: number;
  skippedSameDay: number;
  buckets: ReadonlyArray<{
    from: number;
    to: number;
    count: number;
    meanPredicted: number;
    observedRecall: number;
    gap: number;
  }>;
  meetsThreshold: boolean;
  modelVersion?: string;
  dataFrom?: string;
  dataTo?: string;
}

export interface CalibrationIssueState {
  number: number;
  state: "OPEN" | "CLOSED";
  closedAt: string | null;
}

export type CalibrationIssuePlan =
  | { action: "skip-below-threshold"; samples: number }
  | { action: "skip-cooldown"; number: number; reopenAt: number; daysLeft: number }
  | { action: "create"; title: string; body: string }
  | { action: "update"; number: number; title: string; body: string };

const formatNumber = (value: number | null, digits = 4): string =>
  typeof value === "number" ? value.toFixed(digits) : "无";

export const formatCalibrationIssue = (input: {
  report: CalibrationIssueReport;
  runUrl: string | null;
}): { title: string; body: string } => {
  const { report, runUrl } = input;
  const bucketRows = report.buckets
    .map(
      (bucket) =>
        `| ${bucket.from.toFixed(2)}–${bucket.to.toFixed(2)} | ${bucket.count} | ${bucket.meanPredicted.toFixed(3)} | ${bucket.observedRecall.toFixed(3)} | ${bucket.gap >= 0 ? "+" : ""}${bucket.gap.toFixed(3)} |`,
    )
    .join("\n");

  const body = [
    "## 熟练度校准样本已达标",
    "",
    `- 可校准样本：**${report.samples}** 条`,
    `- Brier：${formatNumber(report.brier)}，AUC：${formatNumber(report.auc)}`,
    `- 跳过样本：首次复习 ${report.skippedNoPrediction}、同日复习 ${report.skippedSameDay}`,
    ...(report.modelVersion ? [`- 生效模型版本：\`${report.modelVersion}\``] : []),
    ...(report.dataFrom && report.dataTo
      ? [`- 数据区间：\`${report.dataFrom} → ${report.dataTo}\`（UTC）`]
      : []),
    ...(runUrl ? [`- 本次运行：[${runUrl}](${runUrl})`] : []),
    "",
    "| 预测区间 | 样本 | 预测均值 | 实际回忆率 | 偏差 |",
    "| --- | --- | --- | --- | --- |",
    bucketRows || "| — | 0 | — | — | — |",
    "",
    "## 拟合与发布步骤",
    "",
    "1. 从本次运行的 artifact `calibration-export` 下载（保留 90 天），或本地执行 `bun run calibrate:export --out calibration-out`。",
    "2. `uv venv --python 3.13`，再 `uv pip install --python <venv>/bin/python fsrs-optimizer==6.5.0`（需要 Python `<3.14`）。",
    '3. 在拟合输出目录 `revlog-fit_csv/` 下放 `.fsrs_optimizer`：`{"timezone":"UTC","next_day":0,"revlog_start_date":"2006-10-05","preview":"n","filter_out_suspended_cards":"n","enable_short_term":"y"}`。',
    "4. `bun run calibrate:replay calibration-out/reviews.json --report calibration-out/report.json --fit-csv calibration-out/revlog-fit.csv`。",
    "5. `python -m fsrs_optimizer calibration-out/revlog-fit.csv -y`，从生成的 `evaluation.json` 的 `parameters` 取 21 个权重（`-o` 追加的是带注释的配置块，不是 JSON）。",
    "6. `bun run calibrate:replay ... --weights evaluation.json` 过门槛。",
    "",
    "## 发布门槛",
    "",
    "- identity 0 mismatch。",
    "- holdout ≥300。",
    "- 相对 Brier 改善 ≥1%。",
    "- AUC 降幅 ≤0.01。",
    "- 间隔 p50 比值 0.7–1.4。",
    "- 当 holdout 无改善时不发布，保留本 Issue。",
    "",
    "流程文档：`docs/DEPLOYMENT.md`「熟练度校准」。",
  ].join("\n");

  return { title: `熟练度校准样本已达标（${report.samples} 条）`, body };
};

export const planCalibrationIssue = (input: {
  report: CalibrationIssueReport;
  issues: ReadonlyArray<CalibrationIssueState>;
  now: number;
  runUrl: string | null;
  cooldownDays?: number;
}): CalibrationIssuePlan => {
  const { report, issues, now, runUrl } = input;

  if (!report.meetsThreshold) {
    return { action: "skip-below-threshold", samples: report.samples };
  }

  const { title, body } = formatCalibrationIssue({ report, runUrl });
  const open = issues.filter((issue) => issue.state === "OPEN");
  if (open.length > 0) {
    const number = open.reduce((min, issue) => Math.min(min, issue.number), Infinity);
    return { action: "update", number, title, body };
  }

  let latestClosed: { number: number; closedAt: number } | null = null;
  for (const issue of issues) {
    if (issue.state !== "CLOSED" || issue.closedAt === null) continue;
    const closedAt = Date.parse(issue.closedAt);
    if (!Number.isFinite(closedAt)) continue;
    if (latestClosed === null || closedAt > latestClosed.closedAt) {
      latestClosed = { number: issue.number, closedAt };
    }
  }

  if (latestClosed !== null) {
    const cooldownMs = (input.cooldownDays ?? CALIBRATION_ISSUE_COOLDOWN_DAYS) * DAY_MS;
    const elapsed = now - latestClosed.closedAt;
    if (elapsed < cooldownMs) {
      const reopenAt = latestClosed.closedAt + cooldownMs;
      return {
        action: "skip-cooldown",
        number: latestClosed.number,
        reopenAt,
        daysLeft: Math.ceil((reopenAt - now) / DAY_MS),
      };
    }
  }

  return { action: "create", title, body };
};
