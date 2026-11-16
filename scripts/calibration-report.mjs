import { readFile, writeFile } from "node:fs/promises";
import {
  CALIBRATION_MIN_SAMPLES,
  buildCalibrationReport,
} from "../apps/web/src/lib/calibrationMetrics.ts";
import { MODEL_VERSION } from "../apps/web/src/lib/masteryModel.ts";
import { createArgs } from "./lib/args.mjs";

const { takeFlag, positional } = createArgs(process.argv.slice(2));
const outFile = takeFlag("out") || null;
const input = positional()[0] ?? "calibration-out/reviews.json";

const raw = JSON.parse(await readFile(input, "utf8"));
const cards = (raw.cards ?? []).map((card) => card.reviews ?? []);
const report = buildCalibrationReport(cards);

let minAt = null;
let maxAt = null;
for (const card of raw.cards ?? []) {
  for (const review of card.reviews ?? []) {
    if (typeof review?.at !== "number") continue;
    if (minAt === null || review.at < minAt) minAt = review.at;
    if (maxAt === null || review.at > maxAt) maxAt = review.at;
  }
}
const dataFrom = minAt === null ? null : new Date(minAt).toISOString().slice(0, 10);
const dataTo = maxAt === null ? null : new Date(maxAt).toISOString().slice(0, 10);
const enriched = { ...report, modelVersion: MODEL_VERSION, dataFrom, dataTo };

console.log(`复习总数: ${report.totalReviews}`);
console.log(`[report] 数据区间：${dataFrom ?? "无"} → ${dataTo ?? "无"}（UTC）`);
console.log(`可校准样本（跨天、有预测值）: ${report.samples}`);
console.log(`跳过：首次复习 ${report.skippedNoPrediction}，同日复习 ${report.skippedSameDay}`);
console.log(`Brier: ${report.brier === null ? "无" : report.brier.toFixed(4)}`);
console.log(`AUC: ${report.auc === null ? "无" : report.auc.toFixed(4)}`);
console.log("预测区间\t样本\t预测均值\t实际回忆率\t偏差");
for (const bucket of report.buckets) {
  console.log(
    `${bucket.from.toFixed(2)}–${bucket.to.toFixed(2)}\t${bucket.count}\t${bucket.meanPredicted.toFixed(3)}\t${bucket.observedRecall.toFixed(3)}\t${bucket.gap >= 0 ? "+" : ""}${bucket.gap.toFixed(3)}`,
  );
}
console.log(
  report.meetsThreshold
    ? `样本已达到拟合门槛（≥${CALIBRATION_MIN_SAMPLES}）`
    : `样本未达到拟合门槛（≥${CALIBRATION_MIN_SAMPLES}），继续积累`,
);

if (outFile) {
  await writeFile(outFile, JSON.stringify(enriched, null, 2));
  console.log(`已写入 ${outFile}`);
}
