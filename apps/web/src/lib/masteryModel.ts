import type { MasteryLevel } from "@/lib/masteryLevels";
import { formatLocalPracticeDate } from "@/lib/practiceDate";

export type Rating = 1 | 2 | 3;
export type MemoryState = "new" | "learning" | "review" | "relearning";

export interface WordMemory {
  stability: number;
  difficulty: number;
  state: MemoryState;
  learningSteps: number;
  due: number;
  lastReviewAt: number | null;
  lastGrade: Rating | null;
  reps: number;
  lapses: number;
  modelVersion: string;
}

export interface WordStats {
  reviewDays: number;
  lastReviewDay: string | null;
  dailyReviews: number;
  hints: number;
}

export interface ReviewLogEntry {
  id: string;
  at: number;
  g: Rating;
  h: boolean;
  r: number | null;
  s: number;
  d: number;
}

export const MODEL_VERSION = "fsrs-6";
export const DAY_MS = 1000 * 60 * 60 * 24;
export const MIN_STABILITY = 0.001;
export const MAX_STABILITY = 36500;
export const REQUEST_RETENTION = 0.9;
export const DAILY_REVIEW_LIMIT = 3;
export const MAX_REVIEWS = 200;
export const MAX_INPUT_TIMES = 20;
export const NEW_WORDS_PER_ROUND = 2;
export const MAX_ROUND_WORDS = 5;
export const MIN_BASELINE_SAMPLES = 5;
export const FLUENCY_SCORE_MULTIPLIER = 80;
export const FLUENCY_SAMPLE_SIZE = 5;
export const MIN_FLUENCY_SAMPLES = 3;
export const SPEED_ANOMALY_FACTOR = 5;
export const WORD_LENGTH_CATEGORY_COUNT = 3;

const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
  0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
  0.0912, 0.0658, 0.1542,
] as const;

const DECAY = -W[20];
const FACTOR = 0.9 ** (1 / DECAY) - 1;
const MINUTE_MS = 60 * 1000;
const LEARNING_STEP_MINUTES = [1, 10] as const;
const RELEARNING_STEP_MINUTES = 10;
const HARD_LEARNING_MINUTES = Math.round(
  (LEARNING_STEP_MINUTES[0] + LEARNING_STEP_MINUTES[1]) / 2
);
const HARD_RELEARNING_MINUTES = Math.round(RELEARNING_STEP_MINUTES * 1.5);
const LAST_LEARNING_STEP = LEARNING_STEP_MINUTES.length - 1;

const LEVEL_RANK: Record<MasteryLevel, number> = {
  new: 0,
  learning: 1,
  familiar: 2,
  proficient: 3,
  mastered: 4,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const initialMemory = (now: number): WordMemory => ({
  stability: 0,
  difficulty: 0,
  state: "new",
  learningSteps: 0,
  due: now,
  lastReviewAt: null,
  lastGrade: null,
  reps: 0,
  lapses: 0,
  modelVersion: MODEL_VERSION,
});

export const initialStats = (): WordStats => ({
  reviewDays: 0,
  lastReviewDay: null,
  dailyReviews: 0,
  hints: 0,
});

export const getLastReviewAt = (memory: WordMemory): number =>
  memory.lastReviewAt ?? 0;

export const isNewMemory = (memory: WordMemory): boolean =>
  memory.state === "new" || memory.reps === 0;

export const retrievability = (
  memory: WordMemory,
  now: number
): number | null => {
  if (isNewMemory(memory) || memory.stability <= 0) return null;
  if (memory.lastReviewAt === null) return null;
  const elapsedDays = Math.floor((now - memory.lastReviewAt) / DAY_MS);
  if (elapsedDays <= 0) return 1;
  return roundTo(
    (1 + (FACTOR * elapsedDays) / memory.stability) ** DECAY,
    8
  );
};

const getElapsedDays = (memory: WordMemory, now: number): number => {
  if (memory.lastReviewAt === null) return 0;
  return Math.max(0, Math.floor((now - memory.lastReviewAt) / DAY_MS));
};

const initialStability = (rating: Rating): number =>
  Math.max(W[rating - 1], 0.1);

const initialDifficulty = (rating: number): number =>
  W[4] - Math.exp((rating - 1) * W[5]) + 1;

const nextDifficulty = (difficulty: number, rating: Rating): number => {
  const delta = -W[6] * (rating - 3);
  const next = difficulty + (delta * (10 - difficulty)) / 9;
  return clamp(
    roundTo(W[7] * initialDifficulty(4) + (1 - W[7]) * next, 8),
    1,
    10
  );
};

const recallStability = (
  difficulty: number,
  stability: number,
  retrievabilityBefore: number,
  rating: Rating
): number => {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const next =
    stability *
    (1 +
      Math.exp(W[8]) *
        (11 - difficulty) *
        stability ** -W[9] *
        (Math.exp(W[10] * (1 - retrievabilityBefore)) - 1) *
        hardPenalty);
  return clamp(roundTo(next, 8), MIN_STABILITY, MAX_STABILITY);
};

const forgetStability = (
  difficulty: number,
  stability: number,
  retrievabilityBefore: number
): number => {
  const stabilityAfterFail =
    W[11] *
    difficulty ** -W[12] *
    ((stability + 1) ** W[13] - 1) *
    Math.exp(W[14] * (1 - retrievabilityBefore));
  const bound = stability / Math.exp(W[17] * W[18]);
  return clamp(
    roundTo(Math.min(stabilityAfterFail, bound), 8),
    MIN_STABILITY,
    MAX_STABILITY
  );
};

const shortTermStability = (stability: number, rating: Rating): number => {
  const factor =
    stability ** -W[19] * Math.exp(W[17] * (rating - 3 + W[18]));
  const masked = rating >= 2 ? Math.max(factor, 1) : factor;
  return clamp(roundTo(stability * masked, 8), MIN_STABILITY, MAX_STABILITY);
};

export const intervalDays = (stability: number): number => {
  const modifier = (REQUEST_RETENTION ** (1 / DECAY) - 1) / FACTOR;
  return Math.min(
    Math.max(1, Math.round(stability * modifier)),
    MAX_STABILITY
  );
};

export const reviewMemory = (
  memory: WordMemory,
  rating: Rating,
  now: number
): WordMemory => {
  const isNew = isNewMemory(memory);
  const elapsedDays = getElapsedDays(memory, now);
  const retrievabilityBefore = isNew
    ? 0
    : ((1 + (FACTOR * elapsedDays) / memory.stability) ** DECAY);
  const stability = isNew
    ? initialStability(rating)
    : elapsedDays === 0
      ? shortTermStability(memory.stability, rating)
      : rating === 1
        ? forgetStability(
            memory.difficulty,
            memory.stability,
            retrievabilityBefore
          )
        : recallStability(
            memory.difficulty,
            memory.stability,
            retrievabilityBefore,
            rating
          );
  const difficulty = isNew
    ? clamp(initialDifficulty(rating), 1, 10)
    : nextDifficulty(memory.difficulty, rating);

  let state: MemoryState = memory.state;
  let learningSteps = memory.learningSteps;
  let lapses = memory.lapses;
  let due: number;

  if (isNew) {
    state = "learning";
    if (rating === 1) {
      learningSteps = 0;
      due = now + LEARNING_STEP_MINUTES[0] * MINUTE_MS;
    } else if (rating === 2) {
      learningSteps = 0;
      due = now + HARD_LEARNING_MINUTES * MINUTE_MS;
    } else {
      learningSteps = 1;
      due = now + LEARNING_STEP_MINUTES[1] * MINUTE_MS;
    }
  } else if (memory.state === "learning") {
    if (rating === 1) {
      learningSteps = 0;
      due = now + LEARNING_STEP_MINUTES[0] * MINUTE_MS;
    } else if (rating === 2) {
      due = now + HARD_LEARNING_MINUTES * MINUTE_MS;
    } else if (memory.learningSteps >= LAST_LEARNING_STEP) {
      state = "review";
      learningSteps = 0;
      due = now + intervalDays(stability) * DAY_MS;
    } else {
      learningSteps = memory.learningSteps + 1;
      due = now + LEARNING_STEP_MINUTES[learningSteps] * MINUTE_MS;
    }
  } else if (memory.state === "relearning") {
    if (rating === 1) {
      learningSteps = 0;
      due = now + RELEARNING_STEP_MINUTES * MINUTE_MS;
    } else if (rating === 2) {
      due = now + HARD_RELEARNING_MINUTES * MINUTE_MS;
    } else {
      state = "review";
      learningSteps = 0;
      due = now + intervalDays(stability) * DAY_MS;
    }
  } else {
    if (rating === 1) {
      state = "relearning";
      learningSteps = 0;
      lapses += 1;
      due = now + RELEARNING_STEP_MINUTES * MINUTE_MS;
    } else {
      state = "review";
      learningSteps = 0;
      due = now + intervalDays(stability) * DAY_MS;
    }
  }

  return {
    stability,
    difficulty,
    state,
    learningSteps,
    due,
    lastReviewAt: now,
    lastGrade: rating,
    reps: memory.reps + 1,
    lapses,
    modelVersion: MODEL_VERSION,
  };
};

export const isMemoryDue = (memory: WordMemory, now: number): boolean =>
  memory.state !== "new" && memory.due <= now;

export const isDailyLimitReached = (
  stats: WordStats,
  now: number
): boolean =>
  stats.lastReviewDay === formatLocalPracticeDate(new Date(now)) &&
  stats.dailyReviews >= DAILY_REVIEW_LIMIT;

const levelFromStability = (stability: number): MasteryLevel => {
  if (stability < 1) return "learning";
  if (stability < 7) return "familiar";
  if (stability < 30) return "proficient";
  return "mastered";
};

const levelUnlockedByReviewDays = (reviewDays: number): MasteryLevel => {
  if (reviewDays <= 1) return "learning";
  if (reviewDays === 2) return "familiar";
  if (reviewDays === 3) return "proficient";
  return "mastered";
};

export const effectiveLevel = (
  memory: WordMemory,
  stats: WordStats
): MasteryLevel => {
  if (isNewMemory(memory)) return "new";
  const band = levelFromStability(memory.stability);
  const unlocked = levelUnlockedByReviewDays(stats.reviewDays);
  return LEVEL_RANK[band] <= LEVEL_RANK[unlocked] ? band : unlocked;
};

export const masteryScoreFor = (
  memory: WordMemory,
  stats: WordStats
): number => {
  const level = effectiveLevel(memory, stats);
  const stability = memory.stability;
  let score: number;
  switch (level) {
    case "new":
      return 0;
    case "learning":
      score = 20 + 19 * Math.min(stability, 1);
      break;
    case "familiar":
      score = 40 + 19 * Math.min((stability - 1) / 6, 1);
      break;
    case "proficient":
      score = 60 + 19 * Math.min((stability - 7) / 23, 1);
      break;
    default:
      score = 80 + 20 * Math.min((stability - 30) / 335, 1);
  }
  return clamp(Math.round(score), 0, 100);
};

export const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

export const getWordLengthCategory = (word: string): number => {
  if (word.length <= 5) return 0;
  if (word.length <= 10) return 1;
  return 2;
};

export const getFallbackInputTime = (wordLength: number): number =>
  wordLength * 0.4 + 0.5;

export const computeBaselinesByLengthCategory = (
  entries: Iterable<readonly [string, { readonly inputTimes: readonly number[] }]>
): Array<number | null> => {
  const timesByCategory: number[][] = Array.from(
    { length: WORD_LENGTH_CATEGORY_COUNT },
    () => []
  );
  for (const [word, data] of entries) {
    timesByCategory[getWordLengthCategory(word)].push(...data.inputTimes);
  }
  return timesByCategory.map((times) =>
    times.length >= MIN_BASELINE_SAMPLES ? median(times) : null
  );
};

export const computeBaselineForWord = (
  entries: Iterable<readonly [string, { readonly inputTimes: readonly number[] }]>,
  word: string
): number => {
  const category = getWordLengthCategory(word);
  const times: number[] = [];
  for (const [entryWord, data] of entries) {
    if (entryWord === word || getWordLengthCategory(entryWord) !== category) {
      continue;
    }
    times.push(...data.inputTimes);
  }
  return times.length >= MIN_BASELINE_SAMPLES
    ? median(times)
    : getFallbackInputTime(word.length);
};

export const calculateFluencyScore = (
  inputTimes: readonly number[],
  baseline: number
): number | null => {
  const samples = inputTimes
    .slice(-FLUENCY_SAMPLE_SIZE)
    .filter((time) => time <= baseline * SPEED_ANOMALY_FACTOR);
  if (samples.length < MIN_FLUENCY_SAMPLES) return null;
  return clamp(
    Math.round((FLUENCY_SCORE_MULTIPLIER * baseline) / median(samples)),
    0,
    100
  );
};
