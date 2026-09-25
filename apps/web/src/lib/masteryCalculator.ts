import { getLocalDateStartMs, getLocalPracticeDate } from "@/lib/practiceDate";
import { getMasteryLevel, type MasteryLevel } from "@/lib/masteryLevels";

export interface WordMetrics {
  word: string;
  correctCount: number;
  totalAttempts: number;
  inputTimes: number[];
  lastPracticedAt: Date | null;
  correctPracticeDates?: string[];
  attemptHistory?: boolean[];
  baselineInputTime?: number | null;
}

export interface MasteryResult {
  score: number;
  level: MasteryLevel;
  accuracyScore: number;
  speedScore: number;
  consistencyScore: number;
  reviewScore: number;
}

const MIN_ATTEMPTS_FOR_FAMILIAR = 3;
const MIN_ATTEMPTS_FOR_PROFICIENT = 5;
const MIN_ATTEMPTS_FOR_MASTERED = 8;
const MIN_REVIEW_DAYS_FOR_PROFICIENT = 2;
const MIN_REVIEW_DAYS_FOR_MASTERED = 3;
const MIN_ACCURACY_FOR_FAMILIAR = 0.5;
const MIN_ACCURACY_FOR_PROFICIENT = 0.7;
const RECENT_ACCURACY_WINDOW = 10;
const MIN_RECENT_ACCURACY_SAMPLES = 3;
const GATE_ACCURACY_WINDOW = 30;
const RECENT_ACCURACY_WEIGHT = 0.5;
const DEFAULT_EARLY_CONSISTENCY = 50;
const SPEED_SCORE_MULTIPLIER = 50;
const ACCURACY_SMOOTHING = 1;
const SPEED_SAMPLE_SIZE = 5;
const CONSISTENCY_SAMPLE_SIZE = 10;
const MIN_CONSISTENCY_SAMPLES = 3;
const SPEED_ANOMALY_FACTOR = 5;
const MIN_BASELINE_SAMPLES = 5;
const REVIEW_DAY_SCORE_MULTIPLIER = 100 / MIN_REVIEW_DAYS_FOR_MASTERED;
const ACCURACY_WEIGHT = 0.5;
const SPEED_WEIGHT = 0.15;
const CONSISTENCY_WEIGHT = 0.2;
const REVIEW_WEIGHT = 0.15;
const RECENT_FAILURE_MULTIPLIER = 3.0;
const DAY_MS = 1000 * 60 * 60 * 24;

const getLatestPracticeDateMs = (dates: readonly string[]): number | null => {
  let latest: number | null = null;
  for (const date of dates) {
    const ms = getLocalDateStartMs(date);
    if (ms !== null && (latest === null || ms > latest)) {
      latest = ms;
    }
  }
  return latest;
};

export function getExpectedInputTime(wordLength: number): number {
  if (wordLength <= 3) {
    return 1.5;
  } else if (wordLength <= 5) {
    return 2.0;
  } else if (wordLength <= 8) {
    return wordLength * 0.35 + 0.5;
  } else {
    return wordLength * 0.4 + 0.5;
  }
}

function getMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function computeBaselineInputTime(times: readonly number[]): number | null {
  return times.length >= MIN_BASELINE_SAMPLES ? getMedian(times) : null;
}

export function calculateMasteryScore(metrics: WordMetrics): MasteryResult {
  const {
    word,
    correctCount,
    totalAttempts,
    inputTimes,
    correctPracticeDates = [],
    attemptHistory = [],
    baselineInputTime = null,
  } = metrics;

  if (totalAttempts === 0) {
    return {
      score: 0,
      level: "new",
      accuracyScore: 0,
      speedScore: 0,
      consistencyScore: 0,
      reviewScore: 0,
    };
  }

  const lifetimeAccuracy =
    ((correctCount + ACCURACY_SMOOTHING) /
      (totalAttempts + ACCURACY_SMOOTHING * 2)) *
    100;

  let accuracyScore = lifetimeAccuracy;
  if (attemptHistory.length >= MIN_RECENT_ACCURACY_SAMPLES) {
    const recent = attemptHistory.slice(-RECENT_ACCURACY_WINDOW);
    const recentCorrect = recent.filter(Boolean).length;
    const recentAccuracy =
      ((recentCorrect + ACCURACY_SMOOTHING) /
        (recent.length + ACCURACY_SMOOTHING * 2)) *
      100;
    accuracyScore =
      recentAccuracy * RECENT_ACCURACY_WEIGHT +
      lifetimeAccuracy * (1 - RECENT_ACCURACY_WEIGHT);
  }

  const expectedTime =
    baselineInputTime && baselineInputTime > 0
      ? baselineInputTime
      : getExpectedInputTime(word.length);
  const speedSamples = inputTimes
    .slice(-SPEED_SAMPLE_SIZE)
    .filter((t) => t <= expectedTime * SPEED_ANOMALY_FACTOR);
  const hasSpeedData = speedSamples.length > 0;
  const avgInputTime = hasSpeedData
    ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
    : expectedTime * 2.5;
  const speedRatio = expectedTime / avgInputTime;
  const speedScore = Math.min(100, Math.max(0, speedRatio * SPEED_SCORE_MULTIPLIER));

  const hasConsistencyData = inputTimes.length >= MIN_CONSISTENCY_SAMPLES;
  let consistencyScore = DEFAULT_EARLY_CONSISTENCY;
  if (hasConsistencyData) {
    const lastTimes = inputTimes.slice(-CONSISTENCY_SAMPLE_SIZE);
    const median = getMedian(lastTimes);
    const deviations = lastTimes.map((t) => Math.abs(t - median));
    const mad = getMedian(deviations);
    const cv = median > 0 ? mad / median : 0;
    consistencyScore = Math.max(0, Math.min(100, 100 * Math.exp(-cv * 2)));
  }

  const reviewDays = new Set(correctPracticeDates.map(getLocalPracticeDate)).size;
  const reviewScore = Math.min(100, reviewDays * REVIEW_DAY_SCORE_MULTIPLIER);

  const weightedFactors = [
    { score: accuracyScore, weight: ACCURACY_WEIGHT },
    ...(hasSpeedData ? [{ score: speedScore, weight: SPEED_WEIGHT }] : []),
    ...(hasConsistencyData
      ? [{ score: consistencyScore, weight: CONSISTENCY_WEIGHT }]
      : []),
    { score: reviewScore, weight: REVIEW_WEIGHT },
  ];
  const weightedTotal = weightedFactors.reduce(
    (sum, f) => sum + f.score * f.weight,
    0
  );
  const totalWeight = weightedFactors.reduce((sum, f) => sum + f.weight, 0);

  let score = Math.round(weightedTotal / totalWeight);

  let gateAccuracy = correctCount / totalAttempts;
  if (attemptHistory.length >= MIN_RECENT_ACCURACY_SAMPLES) {
    const gateWindow = attemptHistory.slice(-GATE_ACCURACY_WINDOW);
    gateAccuracy =
      gateWindow.filter(Boolean).length / gateWindow.length;
  }

  if (
    totalAttempts < MIN_ATTEMPTS_FOR_FAMILIAR ||
    gateAccuracy < MIN_ACCURACY_FOR_FAMILIAR
  ) {
    score = Math.min(score, 39);
  } else if (
    totalAttempts < MIN_ATTEMPTS_FOR_PROFICIENT ||
    reviewDays < MIN_REVIEW_DAYS_FOR_PROFICIENT ||
    gateAccuracy < MIN_ACCURACY_FOR_PROFICIENT
  ) {
    score = Math.min(score, 59);
  } else if (
    totalAttempts < MIN_ATTEMPTS_FOR_MASTERED ||
    reviewDays < MIN_REVIEW_DAYS_FOR_MASTERED
  ) {
    score = Math.min(score, 79);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: finalScore,
    level: getMasteryLevel(finalScore),
    accuracyScore: Math.round(accuracyScore),
    speedScore: Math.round(speedScore),
    consistencyScore: Math.round(consistencyScore),
    reviewScore: Math.round(reviewScore),
  };
}

export function calculatePriority(
  masteryScore: number,
  lastPracticedAt: Date | null,
  totalAttempts: number,
  attemptHistory: readonly boolean[] = [],
  correctPracticeDates: readonly string[] = []
): number {
  const lastAttemptFailed =
    attemptHistory.length > 0 && !attemptHistory[attemptHistory.length - 1];

  const lastCorrectMs = lastAttemptFailed
    ? getLatestPracticeDateMs(correctPracticeDates)
    : null;
  const daysSince =
    lastCorrectMs !== null
      ? (Date.now() - lastCorrectMs) / DAY_MS
      : lastPracticedAt
        ? (Date.now() - lastPracticedAt.getTime()) / DAY_MS
        : 30;

  let recencyMultiplier: number;
  if (daysSince < 1) recencyMultiplier = 0.3;
  else if (daysSince < 2) recencyMultiplier = 0.8;
  else if (daysSince < 4) recencyMultiplier = 1.2;
  else if (daysSince < 7) recencyMultiplier = 2.0;
  else if (daysSince < 14) recencyMultiplier = 8.0;
  else recencyMultiplier = 15.0;

  let practiceMultiplier: number;
  if (totalAttempts === 0) practiceMultiplier = 3.0;
  else if (totalAttempts <= 2) practiceMultiplier = 2.0;
  else if (totalAttempts <= 5) practiceMultiplier = 1.5;
  else if (totalAttempts <= 10) practiceMultiplier = 1.0;
  else practiceMultiplier = 0.8;

  const basePriority = Math.max(10, 100 - masteryScore);

  const failureMultiplier = lastAttemptFailed ? RECENT_FAILURE_MULTIPLIER : 1.0;

  return basePriority * recencyMultiplier * practiceMultiplier * failureMultiplier;
}
