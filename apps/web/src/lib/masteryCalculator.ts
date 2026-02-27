/**
 * Word Familiarity/Mastery Calculator
 *
 * This module implements the mastery algorithm described in docs/WORD_FAMILIARITY_ALGORITHM.md
 */

export interface WordMetrics {
  word: string;
  correctCount: number;
  totalAttempts: number;
  inputTimes: number[];
  lastPracticedAt: Date | null;
}

export interface MasteryResult {
  score: number;
  level: MasteryLevel;
  accuracyScore: number;
  speedScore: number;
  consistencyScore: number;
}

const MIN_ATTEMPTS_FOR_FAMILIAR = 3;
const MIN_ATTEMPTS_FOR_PROFICIENT = 5;
const DEFAULT_EARLY_CONSISTENCY = 30;
const SPEED_SCORE_MULTIPLIER = 40;

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

/**
 * Calculate expected input time based on word length
 * Formula: wordLength * 0.3 + 1.0 seconds
 */
export function getExpectedInputTime(wordLength: number): number {
  return wordLength * 0.3 + 1.0;
}

/**
 * Get mastery level from score
 */
export function getMasteryLevel(score: number): MasteryLevel {
  if (score >= 80) return "mastered";
  if (score >= 60) return "proficient";
  if (score >= 40) return "familiar";
  if (score >= 20) return "learning";
  return "new";
}

/**
 * Get mastery level index (0-4) for UI display
 */
export function getMasteryLevelIndex(score: number): number {
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

/**
 * Calculate the mastery score for a word
 */
export function calculateMasteryScore(metrics: WordMetrics): MasteryResult {
  const { word, correctCount, totalAttempts, inputTimes } = metrics;

  // If never practiced, return 0
  if (totalAttempts === 0) {
    return {
      score: 0,
      level: "new",
      accuracyScore: 0,
      speedScore: 0,
      consistencyScore: 0,
    };
  }

  // Accuracy Factor (40% weight)
  const accuracyScore = (correctCount / totalAttempts) * 100;

  // Speed Factor (30% weight)
  const expectedTime = getExpectedInputTime(word.length);
  const avgInputTime =
    inputTimes.length > 0
      ? inputTimes.reduce((a, b) => a + b, 0) / inputTimes.length
      : expectedTime * 2; // Default to slow if no data
  const speedRatio = expectedTime / avgInputTime;
  const speedScore = Math.min(100, speedRatio * SPEED_SCORE_MULTIPLIER);

  // Consistency Factor (30% weight)
  let consistencyScore = DEFAULT_EARLY_CONSISTENCY; // Default for < 3 attempts
  if (inputTimes.length >= 3) {
    const lastTimes = inputTimes.slice(-10); // Use last 10 times
    const mean = lastTimes.reduce((a, b) => a + b, 0) / lastTimes.length;
    const variance = Math.sqrt(
      lastTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) /
        lastTimes.length
    );
    const cv = mean > 0 ? variance / mean : 0; // Coefficient of variation
    consistencyScore = Math.max(0, Math.min(100, 100 - cv * 100));
  }

  // Final score
  let score = Math.round(
    accuracyScore * 0.4 + speedScore * 0.3 + consistencyScore * 0.3
  );

  if (totalAttempts < MIN_ATTEMPTS_FOR_FAMILIAR) {
    score = Math.min(score, 39);
  } else if (totalAttempts < MIN_ATTEMPTS_FOR_PROFICIENT) {
    score = Math.min(score, 59);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    level: getMasteryLevel(score),
    accuracyScore: Math.round(accuracyScore),
    speedScore: Math.round(speedScore),
    consistencyScore: Math.round(consistencyScore),
  };
}

/**
 * Calculate practice priority for word selection
 * Higher priority = more likely to be selected for practice
 * 
 * PRIORITY RULE: Words not practiced in 7+ days get extremely high priority
 * to ensure weekly review for all words.
 */
export function calculatePriority(
  masteryScore: number,
  lastPracticedAt: Date | null,
  totalAttempts: number
): number {
  // Days since last practice
  const daysSince = lastPracticedAt
    ? (Date.now() - lastPracticedAt.getTime()) / (1000 * 60 * 60 * 24)
    : 30; // Treat as 30 days if never practiced

  // Recency multiplier with strong boost for 7+ days (weekly review guarantee)
  let recencyMultiplier: number;
  if (daysSince < 1) recencyMultiplier = 0.3;
  else if (daysSince < 2) recencyMultiplier = 0.8;
  else if (daysSince < 4) recencyMultiplier = 1.2;
  else if (daysSince < 7) recencyMultiplier = 2.0;
  else if (daysSince < 14) recencyMultiplier = 8.0;  // Very high priority for weekly review
  else recencyMultiplier = 15.0;  // Extremely high for overdue words

  // Practice count multiplier (prioritize new words)
  let practiceMultiplier: number;
  if (totalAttempts === 0) practiceMultiplier = 3.0;
  else if (totalAttempts <= 2) practiceMultiplier = 2.0;
  else if (totalAttempts <= 5) practiceMultiplier = 1.5;
  else if (totalAttempts <= 10) practiceMultiplier = 1.0;
  else practiceMultiplier = 0.8;

  // Base priority: lower mastery = higher priority
  const basePriority = 100 - masteryScore;

  return basePriority * recencyMultiplier * practiceMultiplier;
}
