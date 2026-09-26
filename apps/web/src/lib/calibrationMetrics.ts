export interface ReviewLogLike {
  at: number;
  g: 1 | 2 | 3;
  r: number | null;
}

export interface CalibrationSample {
  predicted: number;
  recalled: boolean;
}

export interface CalibrationBucket {
  from: number;
  to: number;
  count: number;
  meanPredicted: number;
  observedRecall: number;
  gap: number;
}

export interface CalibrationReport {
  totalReviews: number;
  samples: number;
  skippedNoPrediction: number;
  skippedSameDay: number;
  brier: number | null;
  auc: number | null;
  buckets: CalibrationBucket[];
  meetsThreshold: boolean;
}

export const DAY_MS = 86_400_000;
export const CALIBRATION_MIN_SAMPLES = 500;
const DEFAULT_BUCKET_EDGES: readonly number[] = [
  0, 0.6, 0.7, 0.8, 0.9, 0.95, 1.000001,
];

const clamp01 = (value: number): number =>
  Math.min(Math.max(value, 0), 1);

export const buildCalibrationSamples = (
  cards: ReadonlyArray<ReadonlyArray<ReviewLogLike>>,
  minGapMs: number = DAY_MS
): {
  samples: CalibrationSample[];
  skippedNoPrediction: number;
  skippedSameDay: number;
} => {
  const samples: CalibrationSample[] = [];
  let skippedNoPrediction = 0;
  let skippedSameDay = 0;

  for (const card of cards) {
    const ordered = [...card].sort((a, b) => a.at - b.at);
    for (let i = 0; i < ordered.length; i++) {
      const review = ordered[i];
      if (review.r === null) {
        skippedNoPrediction += 1;
        continue;
      }
      const previous = ordered[i - 1];
      if (!previous || review.at - previous.at < minGapMs) {
        skippedSameDay += 1;
        continue;
      }
      samples.push({
        predicted: clamp01(review.r),
        recalled: review.g >= 2,
      });
    }
  }

  return { samples, skippedNoPrediction, skippedSameDay };
};

export const brierScore = (
  samples: ReadonlyArray<CalibrationSample>
): number | null => {
  if (samples.length === 0) return null;
  const total = samples.reduce(
    (sum, sample) =>
      sum + (sample.predicted - (sample.recalled ? 1 : 0)) ** 2,
    0
  );
  return total / samples.length;
};

export const rocAuc = (
  samples: ReadonlyArray<CalibrationSample>
): number | null => {
  const positives = samples.filter((sample) => sample.recalled).length;
  const negatives = samples.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const sorted = [...samples].sort((a, b) => a.predicted - b.predicted);
  let rankSumPositives = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].predicted === sorted[i].predicted) {
      j += 1;
    }
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (sorted[k].recalled) rankSumPositives += averageRank;
    }
    i = j + 1;
  }

  return (
    (rankSumPositives - (positives * (positives + 1)) / 2) /
    (positives * negatives)
  );
};

export const calibrationBuckets = (
  samples: ReadonlyArray<CalibrationSample>,
  edges: readonly number[] = DEFAULT_BUCKET_EDGES
): CalibrationBucket[] => {
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i];
    const to = edges[i + 1];
    const inBucket = samples.filter(
      (sample) => sample.predicted >= from && sample.predicted < to
    );
    if (inBucket.length === 0) continue;
    const meanPredicted =
      inBucket.reduce((sum, sample) => sum + sample.predicted, 0) /
      inBucket.length;
    const observedRecall =
      inBucket.filter((sample) => sample.recalled).length / inBucket.length;
    buckets.push({
      from,
      to,
      count: inBucket.length,
      meanPredicted,
      observedRecall,
      gap: observedRecall - meanPredicted,
    });
  }
  return buckets;
};

export const buildCalibrationReport = (
  cards: ReadonlyArray<ReadonlyArray<ReviewLogLike>>,
  options: {
    minGapMs?: number;
    edges?: readonly number[];
    minSamples?: number;
  } = {}
): CalibrationReport => {
  const { samples, skippedNoPrediction, skippedSameDay } =
    buildCalibrationSamples(cards, options.minGapMs);
  const minSamples = options.minSamples ?? CALIBRATION_MIN_SAMPLES;
  return {
    totalReviews: cards.reduce((sum, card) => sum + card.length, 0),
    samples: samples.length,
    skippedNoPrediction,
    skippedSameDay,
    brier: brierScore(samples),
    auc: rocAuc(samples),
    buckets: calibrationBuckets(
      samples,
      options.edges ?? DEFAULT_BUCKET_EDGES
    ),
    meetsThreshold: samples.length >= minSamples,
  };
};
