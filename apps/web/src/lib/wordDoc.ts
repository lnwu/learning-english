import type { DocumentData } from "firebase/firestore";
import {
  MAX_INPUT_TIMES,
  MAX_REVIEWS,
  MODEL_VERSION,
  initialMemory,
  initialStats,
  type Rating,
  type ReviewLogEntry,
  type WordMemory,
  type WordStats,
} from "@/lib/masteryModel";
import { encodeSenses, type WordSense } from "@/lib/wordSenses";
import type { SyncableWordData, WordData } from "@/lib/wordsStore";

export const translationFields = (senses: WordSense[]) => ({
  translation: encodeSenses(senses),
});

export const newWordDocFields = (word: string, senses: WordSense[]) => ({
  word,
  ...translationFields(senses),
  memory: initialMemory(Date.now()),
  stats: initialStats(),
  inputTimes: [],
  reviews: [],
  createdAt: new Date(),
});

export const practiceFields = (data: Readonly<WordData>): SyncableWordData => ({
  memory: { ...data.memory },
  stats: { ...data.stats },
  inputTimes: [...data.inputTimes],
  reviews: data.reviews.map((entry) => ({ ...entry })),
});

export const attemptUpdateFields = (data: SyncableWordData) => ({
  memory: data.memory,
  stats: data.stats,
  inputTimes: data.inputTimes,
  reviews: data.reviews,
});

export const resetPracticeFields = (now: number) => ({
  memory: initialMemory(now),
  stats: initialStats(),
  inputTimes: [],
  reviews: [],
});

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const parseState = (value: unknown): WordMemory["state"] =>
  value === "learning" || value === "review" || value === "relearning" ? value : "new";

const parseRating = (value: unknown): Rating | null =>
  value === 1 || value === 2 || value === 3 ? value : null;

const parseMemory = (value: unknown, fallbackNow: number): WordMemory => {
  if (!value || typeof value !== "object") {
    return initialMemory(fallbackNow);
  }
  const raw = value as Record<string, unknown>;
  return {
    stability: numberOr(raw.stability, 0),
    difficulty: numberOr(raw.difficulty, 0),
    state: parseState(raw.state),
    learningSteps: numberOr(raw.learningSteps, 0),
    due: numberOr(raw.due, fallbackNow),
    lastReviewAt: typeof raw.lastReviewAt === "number" ? raw.lastReviewAt : null,
    lastGrade: parseRating(raw.lastGrade),
    reps: numberOr(raw.reps, 0),
    lapses: numberOr(raw.lapses, 0),
    modelVersion: typeof raw.modelVersion === "string" ? raw.modelVersion : MODEL_VERSION,
  };
};

const parseStats = (value: unknown): WordStats => {
  if (!value || typeof value !== "object") {
    return initialStats();
  }
  const raw = value as Record<string, unknown>;
  return {
    reviewDays: numberOr(raw.reviewDays, 0),
    lastReviewDay: typeof raw.lastReviewDay === "string" ? raw.lastReviewDay : null,
    dailyReviews: numberOr(raw.dailyReviews, 0),
    hints: numberOr(raw.hints, 0),
  };
};

const parseReview = (value: unknown): ReviewLogEntry | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rating = parseRating(raw.g);
  if (rating === null || typeof raw.id !== "string" || typeof raw.at !== "number") {
    return null;
  }
  return {
    id: raw.id,
    at: raw.at,
    g: rating,
    h: raw.h === true,
    r: typeof raw.r === "number" ? raw.r : null,
    s: numberOr(raw.s, 0),
    d: numberOr(raw.d, 0),
  };
};

export const parseWordDoc = (id: string, data: DocumentData): WordData => {
  const createdAt = data.createdAt?.toDate() ?? new Date();
  const inputTimes = Array.isArray(data.inputTimes)
    ? data.inputTimes
        .filter((time): time is number => typeof time === "number" && Number.isFinite(time))
        .slice(-MAX_INPUT_TIMES)
    : [];
  const reviews = Array.isArray(data.reviews)
    ? data.reviews
        .map(parseReview)
        .filter((entry): entry is ReviewLogEntry => entry !== null)
        .slice(-MAX_REVIEWS)
    : [];

  return {
    word: data.word,
    translation: data.translation,
    memory: parseMemory(data.memory, createdAt.getTime()),
    stats: parseStats(data.stats),
    inputTimes,
    reviews,
    createdAt,
    id,
  };
};
