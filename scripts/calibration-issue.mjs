import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CALIBRATION_MIN_SAMPLES } from "../apps/web/src/lib/calibrationMetrics.ts";

const args = process.argv.slice(2);
const input =
  args.find((arg) => !arg.startsWith("-")) ?? "calibration-out/report.json";
const dryRun = args.includes("--dry-run");
const runUrlIndex = args.indexOf("--run-url");
const runUrl = runUrlIndex >= 0 ? args[runUrlIndex + 1] : null;
const LABEL = "calibration";
const TITLE = "熟练度校准样本已达标";

const report = JSON.parse(readFileSync(input, "utf8"));

if (!report.meetsThreshold) {
  console.log(
    `[issue] 可校准样本 ${report.samples} 未达门槛（${CALIBRATION_MIN_SAMPLES}），跳过`
  );
  process.exit(0);
}

const formatNumber = (value, digits = 4) =>
  typeof value === "number" ? value.toFixed(digits) : "无";

const bucketRows = report.buckets
  .map(
    (bucket) =>
      `| ${bucket.from.toFixed(2)}–${bucket.to.toFixed(2)} | ${bucket.count} | ${bucket.meanPredicted.toFixed(3)} | ${bucket.observedRecall.toFixed(3)} | ${bucket.gap >= 0 ? "+" : ""}${bucket.gap.toFixed(3)} |`
  )
  .join("\n");

const body = [
  "## 熟练度校准样本已达标",
  "",
  `- 可校准样本：**${report.samples}** 条（门槛 ${CALIBRATION_MIN_SAMPLES}）`,
  `- Brier：${formatNumber(report.brier)}，AUC：${formatNumber(report.auc)}`,
  `- 跳过样本：首次复习 ${report.skippedNoPrediction}、同日复习 ${report.skippedSameDay}`,
  ...(runUrl ? [`- 本次运行：[${runUrl}](${runUrl})`] : []),
  "",
  "| 预测区间 | 样本 | 预测均值 | 实际回忆率 | 偏差 |",
  "| --- | --- | --- | --- | --- |",
  bucketRows || "| — | 0 | — | — | — |",
  "",
  "## 拟合步骤",
  "",
  "1. 从本次运行的 artifact `calibration-export` 下载 `revlog.csv`（或本地 `bun run calibrate:export --out calibration-out`）。",
  "2. `python -m pip install fsrs-optimizer`",
  "3. `python -m fsrs_optimizer revlog.csv -y -o weights.json`",
  "4. 将新 `w` 写回 `apps/web/src/lib/masteryModel.ts` 并提升 `MODEL_VERSION`，走功能分支 + Preview 验收后合并，然后关闭本 Issue。",
  "",
  "流程文档：`docs/DEPLOYMENT.md`「熟练度校准」。",
].join("\n");

if (dryRun) {
  console.log(body);
  process.exit(0);
}

execFileSync(
  "gh",
  [
    "label",
    "create",
    LABEL,
    "--description",
    "熟练度校准提醒",
    "--color",
    "1D76DB",
    "--force",
  ],
  { stdio: "inherit" }
);

const existing = JSON.parse(
  execFileSync(
    "gh",
    ["issue", "list", "--label", LABEL, "--state", "open", "--json", "number"],
    { encoding: "utf8" }
  )
);

if (existing.length > 0) {
  console.log(`[issue] 已有未关闭的校准 Issue #${existing[0].number}，跳过`);
  process.exit(0);
}

execFileSync(
  "gh",
  [
    "issue",
    "create",
    "--title",
    `${TITLE}（${report.samples} 条）`,
    "--label",
    LABEL,
    "--body",
    body,
  ],
  { stdio: "inherit" }
);
console.log("[issue] 已创建校准提醒 Issue");
