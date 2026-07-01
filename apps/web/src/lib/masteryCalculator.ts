export interface WordMetrics {
  word: string;
  correctCount: number;
  totalAttempts: number;
  inputTimes: number[];
  lastPracticedAt: Date | null;
  correctPracticeDates?: string[];
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
const DEFAULT_EARLY_CONSISTENCY = 50;
const SPEED_SCORE_MULTIPLIER = 50;
const ACCURACY_SMOOTHING = 1;
const SPEED_SAMPLE_SIZE = 5;
const REVIEW_DAY_SCORE_MULTIPLIER = 100 / MIN_REVIEW_DAYS_FOR_MASTERED;
const ACCURACY_WEIGHT = 0.5;
const SPEED_WEIGHT = 0.15;
const CONSISTENCY_WEIGHT = 0.2;
const REVIEW_WEIGHT = 0.15;

export type MasteryLevel =
  | "new"
  | "learning"
  | "familiar"
  | "proficient"
  | "mastered";

export const MASTERY_LEVELS: Record<
  MasteryLevel,
  { min: number; max: number; color: string }
> = {
  new: { min: 0, max: 19, color: "#EF4444" },
  learning: { min: 20, max: 39, color: "#F97316" },
  familiar: { min: 40, max: 59, color: "#EAB308" },
  proficient: { min: 60, max: 79, color: "#84CC16" },
  mastered: { min: 80, max: 100, color: "#22C55E" },
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

export function getMasteryLevel(score: number): MasteryLevel {
  if (score >= 80) return "mastered";
  if (score >= 60) return "proficient";
  if (score >= 40) return "familiar";
  if (score >= 20) return "learning";
  return "new";
}

export function getMasteryLevelIndex(score: number): number {
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

export function calculateMasteryScore(metrics: WordMetrics): MasteryResult {
  const {
    word,
    correctCount,
    totalAttempts,
    inputTimes,
    correctPracticeDates = [],
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

  const accuracyScore =
    ((correctCount + ACCURACY_SMOOTHING) /
      (totalAttempts + ACCURACY_SMOOTHING * 2)) *
    100;

  const expectedTime = getExpectedInputTime(word.length);
  const speedSamples =
    inputTimes.length > 0 ? inputTimes.slice(-SPEED_SAMPLE_SIZE) : [];
  const avgInputTime =
    speedSamples.length > 0
      ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
      : expectedTime * 2.5;
  const speedRatio = expectedTime / avgInputTime;
  const speedScore = Math.min(100, Math.max(0, speedRatio * SPEED_SCORE_MULTIPLIER));

  let consistencyScore = DEFAULT_EARLY_CONSISTENCY;
  if (inputTimes.length >= 3) {
    const lastTimes = inputTimes.slice(-10);
    const mean = lastTimes.reduce((a, b) => a + b, 0) / lastTimes.length;
    const stdDev = Math.sqrt(
      lastTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) /
        lastTimes.length
    );
    const cv = mean > 0 ? stdDev / mean : 0;
    consistencyScore = Math.max(0, Math.min(100, 100 * Math.exp(-cv * 2)));
  }

  const reviewDays = new Set(correctPracticeDates).size;
  const reviewScore = Math.min(100, reviewDays * REVIEW_DAY_SCORE_MULTIPLIER);

  let score = Math.round(
    accuracyScore * ACCURACY_WEIGHT +
      speedScore * SPEED_WEIGHT +
      consistencyScore * CONSISTENCY_WEIGHT +
      reviewScore * REVIEW_WEIGHT
  );

  if (totalAttempts < MIN_ATTEMPTS_FOR_FAMILIAR) {
    score = Math.min(score, 39);
  } else if (
    totalAttempts < MIN_ATTEMPTS_FOR_PROFICIENT ||
    reviewDays < MIN_REVIEW_DAYS_FOR_PROFICIENT
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
  totalAttempts: number
): number {
  const daysSince = lastPracticedAt
    ? (Date.now() - lastPracticedAt.getTime()) / (1000 * 60 * 60 * 24)
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

  return basePriority * recencyMultiplier * practiceMultiplier;
}
