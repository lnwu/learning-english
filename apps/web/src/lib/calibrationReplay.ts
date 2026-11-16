import {
  brierScore,
  calibrationBuckets,
  calibrationObservations,
  rocAuc,
  type CalibrationBucket,
  type CalibrationObservation,
  type ReviewLogLike,
} from "@/lib/calibrationMetrics";
import {
  FSRS6_DEFAULT_WEIGHTS,
  MODEL_WEIGHTS,
  initialMemory,
  intervalDays,
  retrievability,
  reviewMemory,
  type WordMemory,
} from "@/lib/masteryModel";
import { DAY_MS } from "@/lib/time";

export interface ReplayReview extends ReviewLogLike {
  s?: number | null;
  d?: number | null;
}

export interface ReplayCard {
  cardId?: string;
  reviews: ReadonlyArray<ReplayReview>;
}

export interface ReplayOptions {
  before?: readonly number[];
  after?: readonly number[];
  switchAt?: number;
}

export interface ReplayIntegrity {
  predictions: number;
  exact: number;
  near: number;
  mismatched: number;
  maxDelta: number;
  anchored: boolean;
  skippedFirst: number;
}

export interface ReplayResult {
  cards: ReplayCard[];
  memories: WordMemory[][];
  integrity: ReplayIntegrity;
}

export const REPLAY_HOLDOUT_DAYS = 14;
export const REPLAY_MIN_HOLDOUT_SAMPLES = 300;
export const REPLAY_MIN_BRIER_GAIN = 0.01;
export const REPLAY_MAX_AUC_DROP = 0.01;
export const REPLAY_MIN_INTERVAL_RATIO = 0.7;
export const REPLAY_MAX_INTERVAL_RATIO = 1.4;

export interface ReplayMetrics {
  samples: number;
  brier: number | null;
  auc: number | null;
  ece: number | null;
  constantBrier: number | null;
  predictedMean: number | null;
  observedRecall: number | null;
  buckets: CalibrationBucket[];
}

export interface ReplayGate {
  pass: boolean;
  brierGain: number | null;
  aucDelta: number | null;
  intervalP50Ratio: number | null;
  checks: { samples: boolean; brier: boolean; auc: boolean; interval: boolean };
  reasons: string[];
}

const WEIGHT_COUNT = 21;
const NOON_MS = 12 * 3600_000;
const EXACT_DELTA = 1e-9;
const NEAR_DELTA = 1e-8;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRating = (value: unknown): value is 1 | 2 | 3 => value === 1 || value === 2 || value === 3;

const orderedReviews = (card: ReplayCard): ReplayReview[] =>
  card.reviews
    .filter((review) => isFiniteNumber(review.at) && isRating(review.g))
    .sort((a, b) => a.at - b.at);

const weightsFor = (at: number, options: ReplayOptions): readonly number[] => {
  const switched = options.switchAt !== undefined && at >= options.switchAt;
  const chosen = switched ? (options.after ?? options.before) : (options.before ?? options.after);
  return chosen ?? MODEL_WEIGHTS;
};

const predict = (memory: WordMemory, at: number, weights: readonly number[]): number | null => {
  const value = retrievability(memory, at, weights);
  return value !== null && Number.isFinite(value) ? value : null;
};

interface CardReplay {
  source: ReplayReview[];
  reviews: ReplayReview[];
  memories: WordMemory[];
  anchored: boolean;
  skippedFirst: number;
}

const replayCard = (card: ReplayCard, options: ReplayOptions): CardReplay => {
  const source = orderedReviews(card);
  const anchored =
    source.length > 0 &&
    source.every((review) => isFiniteNumber(review.s) && isFiniteNumber(review.d));
  const switchAt = options.switchAt;
  const switchIndex =
    switchAt === undefined ? -1 : source.findIndex((review) => review.at >= switchAt);
  const usesStored = (index: number): boolean => switchIndex < 0 || index <= switchIndex;

  const reviews: ReplayReview[] = [];
  const memories: WordMemory[] = [];
  let state = initialMemory(source.length > 0 ? source[0].at : 0);
  let skippedFirst = 0;

  for (let index = 0; index < source.length; index++) {
    const review = source[index];
    const weights = weightsFor(review.at, options);
    let before = state;
    const previous = source[index - 1];
    if (
      index > 0 &&
      anchored &&
      usesStored(index) &&
      isFiniteNumber(previous.s) &&
      isFiniteNumber(previous.d)
    ) {
      before = {
        ...state,
        stability: previous.s,
        difficulty: previous.d,
        lastReviewAt: previous.at,
      };
    }
    const predicted = predict(before, review.at, weights);
    if (index === 0 && review.r !== null) skippedFirst += 1;
    state = reviewMemory(before, review.g, review.at, weights);
    memories.push(state);
    reviews.push({ ...review, r: predicted });
  }

  return { source, reviews, memories, anchored, skippedFirst };
};

export const replayCards = (
  cards: ReadonlyArray<ReplayCard>,
  options: ReplayOptions = {},
): ReplayResult => {
  const replayed: ReplayCard[] = [];
  const memories: WordMemory[][] = [];
  const integrity: ReplayIntegrity = {
    predictions: 0,
    exact: 0,
    near: 0,
    mismatched: 0,
    maxDelta: 0,
    anchored: false,
    skippedFirst: 0,
  };

  for (const card of cards) {
    const result = replayCard(card, options);
    replayed.push({ ...card, reviews: result.reviews });
    memories.push(result.memories);
    integrity.anchored = integrity.anchored || result.anchored;
    integrity.skippedFirst += result.skippedFirst;

    for (let index = 1; index < result.reviews.length; index++) {
      const stored = result.source[index].r;
      if (!isFiniteNumber(stored)) continue;
      integrity.predictions += 1;
      const predicted = result.reviews[index].r;
      if (predicted === null) {
        integrity.mismatched += 1;
        continue;
      }
      const delta = Math.abs(predicted - stored);
      integrity.maxDelta = Math.max(integrity.maxDelta, delta);
      if (delta <= EXACT_DELTA) integrity.exact += 1;
      else if (delta <= NEAR_DELTA) integrity.near += 1;
      else integrity.mismatched += 1;
    }
  }

  return { cards: replayed, memories, integrity };
};

export const holdoutCutoff = (
  cards: ReadonlyArray<ReplayCard>,
  days: number = REPLAY_HOLDOUT_DAYS,
): number => {
  let maxAt = Number.NEGATIVE_INFINITY;
  for (const card of cards) {
    for (const review of card.reviews) {
      if (isFiniteNumber(review.at) && review.at > maxAt) maxAt = review.at;
    }
  }
  if (!Number.isFinite(maxAt)) return 0;
  return Math.floor((maxAt - days * DAY_MS) / DAY_MS) * DAY_MS;
};

export const buildFitCsv = (
  cards: ReadonlyArray<ReplayCard>,
  options: { cutoff?: number | null } = {},
): { csv: string; rows: number; cards: number } => {
  const cutoff = options.cutoff ?? null;
  const entries: Array<{ cardId: string; time: number; rating: number }> = [];

  cards.forEach((card, cardIndex) => {
    const cardId = card.cardId ?? `card_${cardIndex}`;
    const source = orderedReviews(card);
    if (source.length === 0) return;
    const anchor = Math.floor(source[0].at / DAY_MS) * DAY_MS;
    let offset = 0;
    source.forEach((review, index) => {
      if (index > 0) offset += Math.floor((review.at - source[index - 1].at) / DAY_MS);
      if (cutoff !== null && review.at >= cutoff) return;
      entries.push({
        cardId,
        time: anchor + offset * DAY_MS + NOON_MS + index,
        rating: review.g,
      });
    });
  });

  entries.sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : a.time - b.time));

  const csv = [
    "card_id,review_time,review_rating",
    ...entries.map((entry) => `${entry.cardId},${entry.time},${entry.rating}`),
  ].join("\n");

  return { csv, rows: entries.length, cards: new Set(entries.map((entry) => entry.cardId)).size };
};

const meanOf = (values: ReadonlyArray<number>): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const quantile = (values: ReadonlyArray<number>, fraction: number): number | null => {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const position = (finite.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return finite[lower] + (finite[upper] - finite[lower]) * (position - lower);
};

const observationKey = (observation: CalibrationObservation): string =>
  `${observation.cardId}:${observation.reviewId}`;

const lossOf = (observation: CalibrationObservation): number =>
  (observation.predicted - (observation.recalled ? 1 : 0)) ** 2;

export const summarizeObservations = (
  observations: ReadonlyArray<CalibrationObservation>,
): ReplayMetrics => {
  const samples = observations.map(({ predicted, recalled }) => ({ predicted, recalled }));
  const buckets = calibrationBuckets(samples);
  const total = samples.length;
  const observedRecall =
    total === 0 ? null : samples.filter((sample) => sample.recalled).length / total;
  const predictedMean = meanOf(samples.map((sample) => sample.predicted));
  const ece =
    total === 0
      ? null
      : buckets.reduce(
          (sum, bucket) =>
            sum + (bucket.count / total) * Math.abs(bucket.observedRecall - bucket.meanPredicted),
          0,
        );
  const constantBrier = observedRecall === null ? null : observedRecall * (1 - observedRecall);

  return {
    samples: total,
    brier: brierScore(samples),
    auc: rocAuc(samples),
    ece,
    constantBrier,
    predictedMean,
    observedRecall,
    buckets,
  };
};

export const pairedDifference = (
  baseline: ReadonlyArray<CalibrationObservation>,
  candidate: ReadonlyArray<CalibrationObservation>,
): {
  count: number;
  mean: number | null;
  se: number | null;
  lower: number | null;
  upper: number | null;
} => {
  const baselineByKey = new Map(
    baseline.map((observation) => [observationKey(observation), observation]),
  );
  const candidateByKey = new Map(
    candidate.map((observation) => [observationKey(observation), observation]),
  );
  if (
    baseline.length !== candidate.length ||
    baselineByKey.size !== candidateByKey.size ||
    baselineByKey.size !== baseline.length
  ) {
    throw new Error("配对样本数量不一致");
  }

  const differences: number[] = [];
  for (const [key, observation] of baselineByKey) {
    const paired = candidateByKey.get(key);
    if (!paired) throw new Error(`配对样本缺少 ${key}`);
    differences.push(lossOf(observation) - lossOf(paired));
  }

  if (differences.length === 0) {
    return { count: 0, mean: null, se: null, lower: null, upper: null };
  }

  const mean = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  if (differences.length === 1) {
    return { count: 1, mean, se: null, lower: null, upper: null };
  }

  const variance =
    differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1);
  const se = Math.sqrt(variance) / Math.sqrt(differences.length);
  return {
    count: differences.length,
    mean,
    se,
    lower: mean - 1.96 * se,
    upper: mean + 1.96 * se,
  };
};

const formatPercent = (value: number): string => `${(value * 100).toFixed(2)}%`;

const formatRatio = (value: number): string => value.toFixed(2);

export const evaluateReplayGate = (
  baseline: ReplayMetrics,
  candidate: ReplayMetrics,
  intervalP50Ratio: number | null,
  options: {
    minSamples?: number;
    minBrierGain?: number;
    maxAucDrop?: number;
    minIntervalRatio?: number;
    maxIntervalRatio?: number;
  } = {},
): ReplayGate => {
  const minSamples = options.minSamples ?? REPLAY_MIN_HOLDOUT_SAMPLES;
  const minBrierGain = options.minBrierGain ?? REPLAY_MIN_BRIER_GAIN;
  const maxAucDrop = options.maxAucDrop ?? REPLAY_MAX_AUC_DROP;
  const minIntervalRatio = options.minIntervalRatio ?? REPLAY_MIN_INTERVAL_RATIO;
  const maxIntervalRatio = options.maxIntervalRatio ?? REPLAY_MAX_INTERVAL_RATIO;

  const brierGain =
    baseline.brier !== null && candidate.brier !== null && baseline.brier > 0
      ? (baseline.brier - candidate.brier) / baseline.brier
      : null;
  const aucDelta =
    baseline.auc !== null && candidate.auc !== null ? candidate.auc - baseline.auc : null;
  const interval =
    intervalP50Ratio !== null && Number.isFinite(intervalP50Ratio) ? intervalP50Ratio : null;

  const checks = {
    samples: candidate.samples >= minSamples,
    brier: brierGain !== null && brierGain >= minBrierGain,
    auc: aucDelta !== null && aucDelta >= -maxAucDrop,
    interval: interval !== null && interval >= minIntervalRatio && interval <= maxIntervalRatio,
  };

  const reasons: string[] = [];
  if (!checks.samples) {
    reasons.push(`holdout 样本 ${candidate.samples} 少于门槛 ${minSamples}`);
  }
  if (!checks.brier) {
    reasons.push(
      brierGain === null
        ? "Brier 缺失，无法比较"
        : `Brier 相对提升 ${formatPercent(brierGain)} 低于门槛 ${formatPercent(minBrierGain)}`,
    );
  }
  if (!checks.auc) {
    reasons.push(
      aucDelta === null
        ? "AUC 缺失，无法比较"
        : `AUC 变化 ${aucDelta.toFixed(4)} 低于下限 ${(-maxAucDrop).toFixed(4)}`,
    );
  }
  if (!checks.interval) {
    reasons.push(
      interval === null
        ? "间隔比值缺失，无法比较"
        : `间隔中位数比值 ${formatRatio(interval)} 不在 [${formatRatio(minIntervalRatio)}, ${formatRatio(maxIntervalRatio)}]`,
    );
  }

  return {
    pass: checks.samples && checks.brier && checks.auc && checks.interval,
    brierGain,
    aucDelta,
    intervalP50Ratio: interval,
    checks,
    reasons,
  };
};

export const applyRevert = (
  weights: readonly number[],
  indexes: ReadonlyArray<number>,
  defaults: readonly number[] = FSRS6_DEFAULT_WEIGHTS,
): number[] => {
  const next = [...weights];
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= WEIGHT_COUNT) {
      throw new RangeError(`权重下标越界：${index}`);
    }
    const value = defaults[index];
    if (!isFiniteNumber(value)) throw new RangeError(`默认权重缺少下标 ${index}`);
    next[index] = value;
  }
  return next;
};

export const compareHoldout = (input: {
  cards: ReadonlyArray<ReplayCard>;
  cutoff: number;
  candidate: readonly number[];
  baseline?: readonly number[];
}): {
  cutoff: number;
  integrity: ReplayIntegrity;
  baseline: { full: ReplayMetrics; holdout: ReplayMetrics };
  candidate: { holdout: ReplayMetrics };
  paired: ReturnType<typeof pairedDifference>;
  intervalShift: { p10: number | null; p50: number | null; p90: number | null };
  gate: ReplayGate;
} => {
  const baselineWeights = input.baseline ?? MODEL_WEIGHTS;
  const cutoff = input.cutoff;
  const baselineReplay = replayCards(input.cards, {
    before: baselineWeights,
    after: baselineWeights,
  });
  const candidateReplay = replayCards(input.cards, {
    before: baselineWeights,
    after: input.candidate,
    switchAt: cutoff,
  });

  const baselineAll = calibrationObservations(
    baselineReplay.cards.map((card) => card.reviews),
  ).observations;
  const candidateAll = calibrationObservations(
    candidateReplay.cards.map((card) => card.reviews),
  ).observations;
  const baselineHoldout = baselineAll.filter((observation) => observation.at >= cutoff);
  const candidateHoldout = candidateAll.filter((observation) => observation.at >= cutoff);

  const paired = pairedDifference(baselineHoldout, candidateHoldout);

  const ratios: number[] = [];
  for (const observation of baselineHoldout) {
    const baselineMemory =
      baselineReplay.memories[observation.cardIndex]?.[observation.reviewIndex];
    const candidateMemory =
      candidateReplay.memories[observation.cardIndex]?.[observation.reviewIndex];
    if (!baselineMemory || !candidateMemory) continue;
    const baselineInterval = intervalDays(baselineMemory.stability, baselineWeights);
    const candidateInterval = intervalDays(candidateMemory.stability, input.candidate);
    if (
      baselineInterval > 0 &&
      Number.isFinite(baselineInterval) &&
      Number.isFinite(candidateInterval)
    ) {
      ratios.push(candidateInterval / baselineInterval);
    }
  }

  const intervalShift = {
    p10: quantile(ratios, 0.1),
    p50: quantile(ratios, 0.5),
    p90: quantile(ratios, 0.9),
  };

  const baselineMetrics = {
    full: summarizeObservations(baselineAll),
    holdout: summarizeObservations(baselineHoldout),
  };
  const candidateMetrics = { holdout: summarizeObservations(candidateHoldout) };

  return {
    cutoff,
    integrity: baselineReplay.integrity,
    baseline: baselineMetrics,
    candidate: candidateMetrics,
    paired,
    intervalShift,
    gate: evaluateReplayGate(baselineMetrics.holdout, candidateMetrics.holdout, intervalShift.p50),
  };
};
