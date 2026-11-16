import { readFile, writeFile } from "node:fs/promises";
import { calibrationObservations } from "../apps/web/src/lib/calibrationMetrics.ts";
import {
  REPLAY_HOLDOUT_DAYS,
  applyRevert,
  buildFitCsv,
  compareHoldout,
  holdoutCutoff,
  replayCards,
  summarizeObservations,
} from "../apps/web/src/lib/calibrationReplay.ts";
import { createArgs } from "./lib/args.mjs";

const WEIGHT_COUNT = 21;
const TOLERANCE = 1e-9;

const formatNumber = (value, digits = 6) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "无";

const formatWeight = (value) => String(Number(value.toPrecision(8)));

const sameNumber = (a, b) =>
  (a === null && b === null) ||
  (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= TOLERANCE);

const parseCutoff = (value) => {
  if (/^\d+$/.test(value)) {
    const ms = Number(value);
    if (Number.isFinite(ms)) return ms;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const ms = Date.parse(`${value}T00:00:00Z`);
    if (Number.isFinite(ms)) return ms;
  }
  throw new Error(`--cutoff 需为 YYYY-MM-DD 或毫秒时间戳：${value}`);
};

const parseDays = (value) => {
  if (value === undefined) return REPLAY_HOLDOUT_DAYS;
  if (value === "") throw new Error("--holdout-days 需要一个数值");
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) throw new Error(`--holdout-days 需为正数：${value}`);
  return days;
};

const loadWeights = async (value) => {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = JSON.parse(await readFile(value, "utf8"));
  }
  const weights = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.parameters)
      ? parsed.parameters
      : parsed?.w;
  if (!Array.isArray(weights)) throw new Error("权重需为数组、{parameters} 或 {w}");
  if (weights.length !== WEIGHT_COUNT) {
    throw new Error(`权重需为 ${WEIGHT_COUNT} 个数值，实际 ${weights.length}`);
  }
  weights.forEach((weight, index) => {
    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      throw new Error(`权重下标 ${index} 不是有限数值`);
    }
  });
  if (!(weights[20] > 0)) throw new Error("权重 w[20] 必须大于 0");
  return weights;
};

const run = async () => {
  const { takeFlag, positional } = createArgs(process.argv.slice(2));
  const holdoutDays = parseDays(takeFlag("holdout-days"));
  const cutoffArg = takeFlag("cutoff") ?? null;
  const fitCsvPath = takeFlag("fit-csv") || null;
  const weightsArg = takeFlag("weights") || null;
  const revertArg = takeFlag("revert") || null;
  const reportPath = takeFlag("report") || null;
  const outPath = takeFlag("out") || null;
  const input = positional()[0];
  if (!input) {
    throw new Error(
      "用法：bun run calibrate:replay <reviews.json> [--holdout-days 14] [--cutoff YYYY-MM-DD|ms] [--fit-csv <path>] [--weights <evaluation.json|{w}|array>] [--revert 1,15] [--report <report.json>] [--out <path>]",
    );
  }

  const raw = JSON.parse(await readFile(input, "utf8"));
  if (!Array.isArray(raw?.cards)) throw new Error(`${input} 缺少 cards 数组`);
  const cards = raw.cards.map((card, index) => ({
    cardId: card?.cardId ?? String(index),
    reviews: Array.isArray(card?.reviews) ? card.reviews : [],
  }));

  const replayed = replayCards(cards);
  const { observations } = calibrationObservations(replayed.cards.map((card) => card.reviews));
  const full = summarizeObservations(observations);
  const identity = replayed.integrity;

  console.log(
    `identity: predictions ${identity.predictions} exact ${identity.exact} near ${identity.near} mismatched ${identity.mismatched} maxDelta ${identity.maxDelta} anchored ${identity.anchored} skippedFirst ${identity.skippedFirst}`,
  );
  console.log(
    `全量: samples ${full.samples} Brier ${formatNumber(full.brier, 7)} AUC ${formatNumber(full.auc)}`,
  );

  if (identity.mismatched > 0) {
    console.error(
      `回放与存储预测值不一致：mismatched ${identity.mismatched}，maxDelta ${identity.maxDelta}`,
    );
    return 2;
  }

  if (reportPath) {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const diffs = [];
    if (report.samples !== full.samples) diffs.push(`samples ${report.samples} → ${full.samples}`);
    if (!sameNumber(report.brier, full.brier)) diffs.push(`Brier ${report.brier} → ${full.brier}`);
    if (!sameNumber(report.auc, full.auc)) diffs.push(`AUC ${report.auc} → ${full.auc}`);
    if (diffs.length > 0) {
      console.error(`report 不一致：${diffs.join("，")}`);
      return 2;
    }
    console.log(`report 一致：${reportPath}`);
  }

  const cutoff = cutoffArg ? parseCutoff(cutoffArg) : holdoutCutoff(cards, holdoutDays);
  const holdoutCount = observations.filter((observation) => observation.at >= cutoff).length;
  console.log(
    `cutoff ${cutoff} (${new Date(cutoff).toISOString().slice(0, 10)}) holdout 观测 ${holdoutCount}`,
  );

  if (fitCsvPath) {
    const fit = buildFitCsv(cards, { cutoff });
    await writeFile(fitCsvPath, `${fit.csv}\n`);
    console.log(`fit-csv: ${fit.rows} 行 / ${fit.cards} 卡 → ${fitCsvPath}`);
  }

  if (!weightsArg) return 0;

  const parsedWeights = await loadWeights(weightsArg);
  const reverted = revertArg ? revertArg.split(",").map((part) => Number(part.trim())) : [];
  const effective = applyRevert(parsedWeights, reverted);
  console.log(`生效权重: ${effective.map(formatWeight).join(", ")}`);
  if (reverted.length > 0) console.log(`回退下标: ${reverted.join(", ")}`);

  const comparison = compareHoldout({ cards, cutoff, candidate: effective });
  const { baseline, candidate, paired, intervalShift, gate } = comparison;

  for (const [label, metrics] of [
    ["baseline", baseline.holdout],
    ["candidate", candidate.holdout],
  ]) {
    console.log(
      `${label} holdout: samples ${metrics.samples} Brier ${formatNumber(metrics.brier)} AUC ${formatNumber(metrics.auc)} ECE ${formatNumber(metrics.ece)} 常数 Brier ${formatNumber(metrics.constantBrier)}`,
    );
  }
  console.log(
    `配对差（baseline 损失 - candidate 损失）: n ${paired.count} mean ${formatNumber(paired.mean)} se ${formatNumber(paired.se)} 95% CI [${formatNumber(paired.lower)}, ${formatNumber(paired.upper)}]`,
  );
  console.log(
    `interval 比值: p10 ${formatNumber(intervalShift.p10, 3)} p50 ${formatNumber(intervalShift.p50, 3)} p90 ${formatNumber(intervalShift.p90, 3)}`,
  );
  console.log(
    `门槛: samples ${gate.checks.samples ? "通过" : "未过"} brier ${gate.checks.brier ? "通过" : "未过"}（${formatNumber(gate.brierGain === null ? null : gate.brierGain * 100, 2)}%） auc ${gate.checks.auc ? "通过" : "未过"}（${formatNumber(gate.aucDelta, 4)}） interval ${gate.checks.interval ? "通过" : "未过"}`,
  );
  console.log(gate.pass ? "gate: pass" : `gate: fail：${gate.reasons.join("；")}`);

  if (outPath) {
    await writeFile(
      outPath,
      JSON.stringify(
        {
          cutoff,
          identity: comparison.integrity,
          baseline,
          candidate,
          paired,
          intervalShift,
          gate,
          weights: parsedWeights,
          reverted,
        },
        null,
        2,
      ),
    );
    console.log(`已写入 ${outPath}`);
  }

  return gate.pass ? 0 : 1;
};

try {
  process.exitCode = await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 3;
}
