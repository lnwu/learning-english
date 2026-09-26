import { readFile, writeFile } from "node:fs/promises";
import {
  CALIBRATION_MIN_SAMPLES,
  buildCalibrationReport,
} from "../apps/web/src/lib/calibrationMetrics.ts";

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith("-")) ?? "calibration-out/reviews.json";
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

const raw = JSON.parse(await readFile(input, "utf8"));
const cards = (raw.cards ?? []).map((card) => card.reviews ?? []);
const report = buildCalibrationReport(cards);

console.log(`复习总数: ${report.totalReviews}`);
console.log(`可校准样本（跨天、有预测值）: ${report.samples}`);
console.log(
  `跳过：首次复习 ${report.skippedNoPrediction}，同日复习 ${report.skippedSameDay}`
);
console.log(`Brier: ${report.brier === null ? "无" : report.brier.toFixed(4)}`);
console.log(`AUC: ${report.auc === null ? "无" : report.auc.toFixed(4)}`);
console.log("预测区间\t样本\t预测均值\t实际回忆率\t偏差");
for (const bucket of report.buckets) {
  console.log(
    `${bucket.from.toFixed(2)}–${bucket.to.toFixed(2)}\t${bucket.count}\t${bucket.meanPredicted.toFixed(3)}\t${bucket.observedRecall.toFixed(3)}\t${bucket.gap >= 0 ? "+" : ""}${bucket.gap.toFixed(3)}`
  );
}
console.log(
  report.meetsThreshold
    ? `样本已达到拟合门槛（≥${CALIBRATION_MIN_SAMPLES}）`
    : `样本未达到拟合门槛（≥${CALIBRATION_MIN_SAMPLES}），继续积累`
);

if (outFile) {
  await writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(`已写入 ${outFile}`);
}
