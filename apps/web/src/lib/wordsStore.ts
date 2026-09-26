import { makeAutoObservable } from "mobx";
import type { DocumentData } from "firebase/firestore";
import { getMasteryLevelIndex } from "@/lib/masteryLevels";
import { formatLocalPracticeDate } from "@/lib/practiceDate";
import {
  DAILY_REVIEW_LIMIT,
  MAX_INPUT_TIMES,
  MAX_REVIEWS,
  MAX_ROUND_WORDS,
  NEW_WORDS_PER_ROUND,
  calculateFluencyScore,
  computeBaselineForWord,
  computeBaselinesByLengthCategory,
  getLastReviewAt,
  getWordLengthCategory,
  initialMemory,
  initialStats,
  isDailyLimitReached,
  isMemoryDue,
  isNewMemory,
  masteryScoreFor,
  retrievability,
  reviewMemory,
  type Rating,
  type ReviewLogEntry,
  type WordMemory,
  type WordStats,
} from "@/lib/masteryModel";
import { parseWordDoc } from "@/lib/wordDoc";

const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const arraysEqual = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const hashWord = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export interface WordData {
  word: string;
  translation: string;
  memory: WordMemory;
  stats: WordStats;
  inputTimes: number[];
  reviews: ReviewLogEntry[];
  createdAt: Date;
  id: string;
}

export interface PracticeStat {
  word: string;
  avgTime: number;
  count: number;
  masteryScore: number;
  reviews: number;
  hints: number;
  fluencyScore: number | null;
}

export interface SyncableWordData {
  memory: WordMemory;
  stats: WordStats;
  inputTimes: number[];
  reviews: ReviewLogEntry[];
}

export interface PendingWordUpdate {
  wordId: string;
  data: SyncableWordData;
}

export interface MergedSnapshotResult {
  byWord: Map<string, WordData>;
  byId: Map<string, WordData>;
}

const memoryEquals = (a: WordMemory, b: WordMemory): boolean =>
  a.stability === b.stability &&
  a.difficulty === b.difficulty &&
  a.state === b.state &&
  a.learningSteps === b.learningSteps &&
  a.due === b.due &&
  a.lastReviewAt === b.lastReviewAt &&
  a.lastGrade === b.lastGrade &&
  a.reps === b.reps &&
  a.lapses === b.lapses &&
  a.modelVersion === b.modelVersion;

const statsEquals = (a: WordStats, b: WordStats): boolean =>
  a.reviewDays === b.reviewDays &&
  a.lastReviewDay === b.lastReviewDay &&
  a.dailyReviews === b.dailyReviews &&
  a.hints === b.hints;

const reviewsEqual = (a: readonly ReviewLogEntry[], b: readonly ReviewLogEntry[]): boolean =>
  a.length === b.length &&
  a.every(
    (entry, index) =>
      entry.id === b[index].id &&
      entry.at === b[index].at &&
      entry.g === b[index].g &&
      entry.h === b[index].h &&
      entry.r === b[index].r &&
      entry.s === b[index].s &&
      entry.d === b[index].d,
  );

const mergeMemory = (a: WordMemory, b: WordMemory): WordMemory => {
  const aAt = getLastReviewAt(a);
  const bAt = getLastReviewAt(b);
  if (aAt !== bAt) return aAt > bAt ? a : b;
  return a.stability <= b.stability ? a : b;
};

const mergeStats = (a: WordStats, b: WordStats): WordStats => {
  const later = (a.lastReviewDay ?? "") >= (b.lastReviewDay ?? "") ? a : b;
  const sameDay = a.lastReviewDay === b.lastReviewDay;
  return {
    reviewDays: Math.max(a.reviewDays, b.reviewDays),
    lastReviewDay: later.lastReviewDay,
    dailyReviews: sameDay ? Math.max(a.dailyReviews, b.dailyReviews) : later.dailyReviews,
    hints: Math.max(a.hints, b.hints),
  };
};

const mergeReviews = (
  a: readonly ReviewLogEntry[],
  b: readonly ReviewLogEntry[],
): ReviewLogEntry[] => {
  const byId = new Map<string, ReviewLogEntry>();
  [...a, ...b].forEach((entry) => {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  });
  return Array.from(byId.values())
    .sort((x, y) => x.at - y.at)
    .slice(-MAX_REVIEWS);
};

const mergeInputTimes = (a: readonly number[], b: readonly number[]): number[] =>
  [...a, ...b].slice(-MAX_INPUT_TIMES);

export class Words {
  static MAX_RANDOM_WORDS = MAX_ROUND_WORDS;
  static MAX_NEW_WORDS_PER_ROUND = NEW_WORDS_PER_ROUND;
  static MAX_INPUT_TIMES = MAX_INPUT_TIMES;
  static MAX_REVIEWS = MAX_REVIEWS;
  static DAILY_REVIEW_LIMIT = DAILY_REVIEW_LIMIT;

  private wordData: Map<string, WordData> = new Map();
  private userInputs: Map<string, string> = new Map();

  constructor() {
    makeAutoObservable(this);
  }

  setWordData(word: string, data: WordData) {
    this.wordData.set(word, data);
  }

  get wordCount(): number {
    return this.wordData.size;
  }

  knownWords(): string[] {
    return Array.from(this.wordData.keys());
  }

  hasWord(word: string): boolean {
    return this.wordData.has(word);
  }

  wordEntries(): Array<[string, Readonly<WordData>]> {
    return Array.from(this.wordData.entries());
  }

  resetPracticeRecords(): Readonly<WordData>[] {
    const now = Date.now();
    this.wordData.forEach((data) => {
      data.memory = initialMemory(now);
      data.stats = initialStats();
      data.inputTimes = [];
      data.reviews = [];
    });
    return Array.from(this.wordData.values());
  }

  deleteWord(word: string) {
    this.wordData.delete(word);
  }

  moveWord(from: string, to: string, data: WordData) {
    this.wordData.delete(from);
    this.wordData.set(to, data);
    this.userInputs.delete(from);
  }

  removeAllWords() {
    this.wordData.clear();
  }

  recordReview(
    word: string,
    rating: Rating,
    options: {
      hint?: boolean;
      inputTimeSeconds?: number;
      now?: number;
    } = {},
  ): void {
    const data = this.wordData.get(word);
    if (!data) return;

    const now = options.now ?? Date.now();
    const hint = options.hint === true;
    const retrievabilityBefore = retrievability(data.memory, now);
    const memory = reviewMemory(data.memory, rating, now);
    data.memory = memory;

    const today = formatLocalPracticeDate(new Date(now));
    if (data.stats.lastReviewDay === today) {
      data.stats.dailyReviews += 1;
    } else {
      data.stats.reviewDays += 1;
      data.stats.lastReviewDay = today;
      data.stats.dailyReviews = 1;
    }
    if (hint) {
      data.stats.hints += 1;
    }

    if (rating !== 1 && options.inputTimeSeconds !== undefined) {
      data.inputTimes.push(options.inputTimeSeconds);
      if (data.inputTimes.length > MAX_INPUT_TIMES) {
        data.inputTimes = data.inputTimes.slice(-MAX_INPUT_TIMES);
      }
    }

    data.reviews.push({
      id: `${now}_${Math.random().toString(36).slice(2, 10)}`,
      at: now,
      g: rating,
      h: hint,
      r: retrievabilityBefore,
      s: memory.stability,
      d: memory.difficulty,
    });
    if (data.reviews.length > MAX_REVIEWS) {
      data.reviews = data.reviews.slice(-MAX_REVIEWS);
    }
  }

  getMasteryScore(word: string): number {
    const data = this.wordData.get(word);
    if (!data) return 0;
    return masteryScoreFor(data.memory, data.stats);
  }

  getMasteryLevelIndex(word: string): number {
    return getMasteryLevelIndex(this.getMasteryScore(word));
  }

  get overallAverageInputTime(): number | null {
    const allTimes: number[] = [];
    this.wordData.forEach((data) => {
      allTimes.push(...data.inputTimes);
    });
    return allTimes.length === 0 ? null : average(allTimes);
  }

  getWordLengthCategory(word: string): number {
    return getWordLengthCategory(word);
  }

  get inputTimeBaselineByLengthCategory(): (number | null)[] {
    return computeBaselinesByLengthCategory(this.wordData.entries());
  }

  getFluencyScore(word: string): number | null {
    const data = this.wordData.get(word);
    if (!data) return null;
    const baseline = computeBaselineForWord(this.wordData.entries(), word);
    return calculateFluencyScore(data.inputTimes, baseline);
  }

  getWordData(word: string): Readonly<WordData> | undefined {
    return this.wordData.get(word);
  }

  getWordId(word: string): string | undefined {
    return this.wordData.get(word)?.id;
  }

  getTranslation(word: string): string | undefined {
    return this.wordData.get(word)?.translation;
  }

  setUserInput(word: string, value: string) {
    this.userInputs.set(word, value);
  }

  getUserInput(word: string): string {
    return this.userInputs.get(word) ?? "";
  }

  clearUserInputs() {
    this.userInputs.clear();
  }

  getRandomWords(max: number = Words.MAX_RANDOM_WORDS): [string, string][] {
    const now = Date.now();
    const today = formatLocalPracticeDate(new Date(now));
    const items = Array.from(this.wordData.entries()).map(([word, data]) => ({
      word,
      translation: data.translation,
      createdAt: data.createdAt.getTime(),
      due: data.memory.due,
      isNew: isNewMemory(data.memory),
      isStep: data.memory.state === "learning" || data.memory.state === "relearning",
      dueNow: isMemoryDue(data.memory, now),
      capped: isDailyLimitReached(data.stats, now),
      reviewedToday: data.stats.lastReviewDay === today && data.stats.dailyReviews > 0,
      retrievability: retrievability(data.memory, now) ?? 1,
    }));

    const selected: typeof items = [];
    const picked = new Set<string>();
    const tieBreak = (a: (typeof items)[number], b: (typeof items)[number]) =>
      hashWord(a.word + today) - hashWord(b.word + today);
    const take = (candidates: Array<(typeof items)[number]>) => {
      for (const item of candidates) {
        if (selected.length >= max) return;
        if (picked.has(item.word)) continue;
        picked.add(item.word);
        selected.push(item);
      }
    };

    take(
      items
        .filter((item) => item.isStep && item.dueNow && !item.capped)
        .sort((a, b) => a.due - b.due || tieBreak(a, b)),
    );
    take(
      items
        .filter(
          (item) =>
            !item.isNew && !item.isStep && item.dueNow && !item.capped && !item.reviewedToday,
        )
        .sort((a, b) => a.retrievability - b.retrievability || tieBreak(a, b)),
    );

    const newQuota = Math.min(NEW_WORDS_PER_ROUND, Math.floor(max / 2), max - selected.length);
    take(
      items
        .filter((item) => item.isNew)
        .sort((a, b) => a.createdAt - b.createdAt || tieBreak(a, b))
        .slice(0, newQuota),
    );

    take(
      items
        .filter((item) => !item.isNew && !item.capped && !item.reviewedToday)
        .sort((a, b) => a.retrievability - b.retrievability || tieBreak(a, b)),
    );
    take(
      items
        .filter((item) => item.isNew)
        .sort((a, b) => a.createdAt - b.createdAt || tieBreak(a, b)),
    );

    return selected.map((item): [string, string] => [item.word, item.translation]);
  }

  get practiceStats(): PracticeStat[] {
    const stats: PracticeStat[] = [];
    const entries = this.wordData.entries();

    this.wordData.forEach((data, word) => {
      const times = data.inputTimes;
      const baseline = computeBaselineForWord(entries, word);
      stats.push({
        word,
        avgTime: times.length > 0 ? average(times) : 0,
        count: times.length,
        masteryScore: masteryScoreFor(data.memory, data.stats),
        reviews: data.memory.reps,
        hints: data.stats.hints,
        fluencyScore: calculateFluencyScore(times, baseline),
      });
    });

    stats.sort((a, b) => a.masteryScore - b.masteryScore);
    return stats;
  }
}

export const mergeWordData = (
  target: Readonly<WordData>,
  source: Readonly<WordData>,
): WordData => ({
  ...target,
  memory: mergeMemory(target.memory, source.memory),
  stats: mergeStats(target.stats, source.stats),
  inputTimes: mergeInputTimes(target.inputTimes, source.inputTimes),
  reviews: mergeReviews(target.reviews, source.reviews),
  createdAt:
    target.createdAt.getTime() <= source.createdAt.getTime() ? target.createdAt : source.createdAt,
});

const isWordDataEqual = (a: Readonly<WordData>, b: Readonly<WordData>): boolean =>
  a.id === b.id &&
  a.word === b.word &&
  a.translation === b.translation &&
  a.createdAt.getTime() === b.createdAt.getTime() &&
  memoryEquals(a.memory, b.memory) &&
  statsEquals(a.stats, b.stats) &&
  arraysEqual(a.inputTimes, b.inputTimes) &&
  reviewsEqual(a.reviews, b.reviews);

const isSyncableDataEqual = (a: SyncableWordData, b: SyncableWordData): boolean =>
  memoryEquals(a.memory, b.memory) &&
  statsEquals(a.stats, b.stats) &&
  arraysEqual(a.inputTimes, b.inputTimes) &&
  reviewsEqual(a.reviews, b.reviews);

export const isQueueItemStale = (
  firestore: SyncableWordData,
  queued: SyncableWordData,
): boolean => {
  const firestoreAt = getLastReviewAt(firestore.memory);
  const queuedAt = getLastReviewAt(queued.memory);
  if (firestoreAt > queuedAt) return true;
  if (firestoreAt < queuedAt) return false;
  return isSyncableDataEqual(firestore, queued);
};

export const mergeSnapshotIntoStore = (
  store: Words,
  snapshot: {
    docs: Array<{ id: string; data: () => DocumentData }>;
  },
  pending: PendingWordUpdate[] = [],
): MergedSnapshotResult => {
  const byId = new Map<string, WordData>();
  const byWord = new Map<string, WordData>();

  snapshot.docs.forEach((doc) => {
    const parsed = parseWordDoc(doc.id, doc.data());
    byId.set(doc.id, parsed);
    byWord.set(parsed.word, parsed);
  });
  for (const item of pending) {
    const firestoreWord = byId.get(item.wordId);
    if (!firestoreWord) continue;
    if (getLastReviewAt(firestoreWord.memory) > getLastReviewAt(item.data.memory)) {
      continue;
    }

    const merged: WordData = {
      ...firestoreWord,
      memory: mergeMemory(firestoreWord.memory, item.data.memory),
      stats: mergeStats(firestoreWord.stats, item.data.stats),
      inputTimes: mergeInputTimes(firestoreWord.inputTimes, item.data.inputTimes),
      reviews: mergeReviews(firestoreWord.reviews, item.data.reviews),
    };
    byWord.set(merged.word, merged);
  }

  for (const word of store.knownWords()) {
    if (!byWord.has(word)) {
      store.deleteWord(word);
    }
  }

  for (const [word, data] of byWord) {
    const existing = store.getWordData(word);
    if (!existing || !isWordDataEqual(existing, data)) {
      store.setWordData(word, data);
    }
  }

  return { byWord, byId };
};
