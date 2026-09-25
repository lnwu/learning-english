import { makeAutoObservable } from "mobx";
import type { DocumentData } from "firebase/firestore";
import {
  calculateMasteryScore,
  calculatePriority,
  computeBaselineInputTime,
  type MasteryResult,
} from "@/lib/masteryCalculator";
import { getMasteryLevelIndex } from "@/lib/masteryLevels";
import {
  formatLocalPracticeDate,
} from "@/lib/practiceDate";
import { parseWordDoc } from "@/lib/wordDoc";

const SHORT_WORD_MAX_LENGTH = 5;
const MEDIUM_WORD_MAX_LENGTH = 10;
const WORD_LENGTH_CATEGORY_COUNT = 3;

const average = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const arraysEqual = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const pickWeightedRandom = <T extends { priority: number }>(
  candidates: readonly T[],
  max: number
): T[] => {
  const available = [...candidates];
  const selected: T[] = [];
  let totalPriority = available.reduce((sum, item) => sum + item.priority, 0);
  const limit = Math.min(max, available.length);

  for (let i = 0; i < limit; i++) {
    let random = Math.random() * totalPriority;
    let selectedIndex = 0;

    for (let j = 0; j < available.length; j++) {
      random -= available[j].priority;
      if (random <= 0) {
        selectedIndex = j;
        break;
      }
    }

    const selectedItem = available[selectedIndex];
    selected.push(selectedItem);
    available.splice(selectedIndex, 1);
    totalPriority -= selectedItem.priority;
  }

  return selected;
};

export interface WordData {
  word: string;
  translation: string;
  correctCount: number;
  totalAttempts: number;
  inputTimes: number[];
  lastPracticedAt: Date | null;
  correctPracticeDates: string[];
  attemptHistory: boolean[];
  createdAt: Date;
  id: string;
}

export interface PracticeStat {
  word: string;
  avgTime: number;
  count: number;
  masteryScore: number;
  correctCount: number;
  totalAttempts: number;
}

export class Words {
  static MAX_RANDOM_WORDS = 5;
  static MAX_NEW_WORDS_PER_ROUND = 2;
  static MAX_INPUT_TIMES = 20;
  static MAX_CORRECT_PRACTICE_DATES = 30;
  static MAX_ATTEMPT_HISTORY = 30;

  private wordData: Map<string, WordData> = new Map();
  private userInputs: Map<string, string> = new Map();
  #masteryCache = new Map<
    string,
    { result: MasteryResult; baseline: number | null }
  >();
  #baselineByLengthCategory: (number | null)[] | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  private invalidateCaches() {
    this.#masteryCache.clear();
    this.#baselineByLengthCategory = null;
  }

  #invalidateWordCaches(...words: string[]) {
    for (const word of words) {
      this.#masteryCache.delete(word);
    }
    this.#baselineByLengthCategory = null;
  }

  setWordData(word: string, data: WordData) {
    this.wordData.set(word, data);
    this.#invalidateWordCaches(word);
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
    this.wordData.forEach((data) => {
      data.correctCount = 0;
      data.totalAttempts = 0;
      data.inputTimes = [];
      data.lastPracticedAt = null;
      data.correctPracticeDates = [];
      data.attemptHistory = [];
    });
    this.invalidateCaches();
    return Array.from(this.wordData.values());
  }

  deleteWord(word: string) {
    this.wordData.delete(word);
    this.#invalidateWordCaches(word);
  }

  moveWord(from: string, to: string, data: WordData) {
    this.wordData.delete(from);
    this.wordData.set(to, data);
    this.userInputs.delete(from);
    this.#invalidateWordCaches(from, to);
  }

  removeAllWords() {
    this.wordData.clear();
    this.invalidateCaches();
  }

  #recordAttempt(word: string, correct: boolean, inputTimeSeconds?: number) {
    const data = this.wordData.get(word);
    if (!data) return;

    data.totalAttempts += 1;
    if (correct) {
      data.correctCount += 1;
    }
    data.attemptHistory.push(correct);
    if (data.attemptHistory.length > Words.MAX_ATTEMPT_HISTORY) {
      data.attemptHistory = data.attemptHistory.slice(-Words.MAX_ATTEMPT_HISTORY);
    }

    if (correct && inputTimeSeconds !== undefined) {
      data.inputTimes.push(inputTimeSeconds);
      if (data.inputTimes.length > Words.MAX_INPUT_TIMES) {
        data.inputTimes = data.inputTimes.slice(-Words.MAX_INPUT_TIMES);
      }
    }

    const now = new Date();
    if (correct) {
      const today = formatLocalPracticeDate(now);
      if (!data.correctPracticeDates.includes(today)) {
        data.correctPracticeDates.push(today);
        if (data.correctPracticeDates.length > Words.MAX_CORRECT_PRACTICE_DATES) {
          data.correctPracticeDates = data.correctPracticeDates.slice(-Words.MAX_CORRECT_PRACTICE_DATES);
        }
      }
    }
    data.lastPracticedAt = now;

    this.#invalidateWordCaches(word);
  }

  recordCorrectAttempt(word: string, inputTimeSeconds?: number) {
    this.#recordAttempt(word, true, inputTimeSeconds);
  }

  recordIncorrectAttempt(word: string) {
    this.#recordAttempt(word, false);
  }

  #getBaselineByLengthCategory(): (number | null)[] {
    if (!this.#baselineByLengthCategory) {
      const categoryTimes: number[][] = Array.from(
        { length: WORD_LENGTH_CATEGORY_COUNT },
        () => []
      );
      this.wordData.forEach((data, word) => {
        categoryTimes[this.getWordLengthCategory(word)].push(...data.inputTimes);
      });
      this.#baselineByLengthCategory = categoryTimes.map(computeBaselineInputTime);
    }
    return this.#baselineByLengthCategory;
  }

  #getMastery(word: string, data: WordData): MasteryResult {
    const baseline =
      this.#getBaselineByLengthCategory()[this.getWordLengthCategory(word)] ??
      null;
    const cached = this.#masteryCache.get(word);
    if (cached && cached.baseline === baseline) {
      return cached.result;
    }
    const result = calculateMasteryScore({ ...data, baselineInputTime: baseline });
    this.#masteryCache.set(word, { result, baseline });
    return result;
  }

  #getPriority(word: string, data: WordData): number {
    const masteryScore = this.#getMastery(word, data).score;
    return calculatePriority(
      masteryScore,
      data.lastPracticedAt,
      data.totalAttempts,
      data.attemptHistory,
      data.correctPracticeDates
    );
  }

  getMasteryScore(word: string): number {
    const data = this.wordData.get(word);
    if (!data) return 0;
    return this.#getMastery(word, data).score;
  }

  getWordPriority(word: string): number {
    const data = this.wordData.get(word);
    if (!data) return 0;
    return this.#getPriority(word, data);
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
    const length = word.length;
    if (length <= SHORT_WORD_MAX_LENGTH) return 0;
    if (length <= MEDIUM_WORD_MAX_LENGTH) return 1;
    return 2;
  }

  get inputTimeBaselineByLengthCategory(): (number | null)[] {
    return [...this.#getBaselineByLengthCategory()];
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
    const candidates = Array.from(this.wordData.entries()).map(
      ([word, data]) => ({
        word,
        translation: data.translation,
        priority: this.#getPriority(word, data),
        isNew: data.totalAttempts === 0,
      })
    );

    const newCandidates = candidates.filter((item) => item.isNew);
    const reviewCandidates = candidates.filter((item) => !item.isNew);
    const newReserve = Math.min(
      newCandidates.length,
      Math.floor(max / 2),
      Words.MAX_NEW_WORDS_PER_ROUND
    );

    const reviewSelected = pickWeightedRandom(reviewCandidates, max - newReserve);
    const newSelected = pickWeightedRandom(
      newCandidates,
      max - reviewSelected.length
    );

    return [...newSelected, ...reviewSelected].map(
      ({ word, translation }): [string, string] => [word, translation]
    );
  }

  get practiceStats(): PracticeStat[] {
    const stats: PracticeStat[] = [];

    this.wordData.forEach((data, word) => {
      const times = data.inputTimes;
      const avg = times.length > 0 ? average(times) : 0;
      stats.push({
        word,
        avgTime: avg,
        count: times.length,
        masteryScore: this.#getMastery(word, data).score,
        correctCount: data.correctCount,
        totalAttempts: data.totalAttempts,
      });
    });

    stats.sort((a, b) => a.masteryScore - b.masteryScore);
    return stats;
  }
}

export const mergeWordData = (
  target: Readonly<WordData>,
  source: Readonly<WordData>
): WordData => {
  const lastPracticedAt =
    target.lastPracticedAt && source.lastPracticedAt
      ? new Date(
          Math.max(
            target.lastPracticedAt.getTime(),
            source.lastPracticedAt.getTime()
          )
        )
      : target.lastPracticedAt ?? source.lastPracticedAt;

  return {
    ...target,
    correctCount: target.correctCount + source.correctCount,
    totalAttempts: target.totalAttempts + source.totalAttempts,
    inputTimes: [...target.inputTimes, ...source.inputTimes].slice(
      -Words.MAX_INPUT_TIMES
    ),
    lastPracticedAt,
    correctPracticeDates: Array.from(
      new Set([...target.correctPracticeDates, ...source.correctPracticeDates])
    )
      .sort()
      .slice(-Words.MAX_CORRECT_PRACTICE_DATES),
    attemptHistory: [...target.attemptHistory, ...source.attemptHistory].slice(
      -Words.MAX_ATTEMPT_HISTORY
    ),
    createdAt:
      target.createdAt.getTime() <= source.createdAt.getTime()
        ? target.createdAt
        : source.createdAt,
  };
};

export const isWordDataEqual = (a: Readonly<WordData>, b: Readonly<WordData>) => {
  if (
    a.id !== b.id ||
    a.translation !== b.translation ||
    a.correctCount !== b.correctCount ||
    a.totalAttempts !== b.totalAttempts ||
    a.lastPracticedAt?.getTime() !== b.lastPracticedAt?.getTime() ||
    a.createdAt?.getTime() !== b.createdAt?.getTime() ||
    a.inputTimes.length !== b.inputTimes.length ||
    a.correctPracticeDates.length !== b.correctPracticeDates.length ||
    a.attemptHistory.length !== b.attemptHistory.length
  ) {
    return false;
  }
  return (
    arraysEqual(a.inputTimes, b.inputTimes) &&
    arraysEqual(a.correctPracticeDates, b.correctPracticeDates) &&
    arraysEqual(a.attemptHistory, b.attemptHistory)
  );
};

export interface SyncableWordData {
  correctCount: number;
  totalAttempts: number;
  inputTimes: number[];
  correctPracticeDates?: string[];
  attemptHistory?: boolean[];
}

export interface PendingWordUpdate {
  wordId: string;
  data: SyncableWordData;
  practicedAt: number;
}

export interface MergedSnapshotResult {
  byWord: Map<string, WordData>;
  byId: Map<string, WordData>;
}

export const isSyncableDataEqual = (
  a: SyncableWordData,
  b: SyncableWordData
): boolean =>
  a.correctCount === b.correctCount &&
  a.totalAttempts === b.totalAttempts &&
  arraysEqual(a.inputTimes, b.inputTimes) &&
  arraysEqual(a.correctPracticeDates ?? [], b.correctPracticeDates ?? []) &&
  arraysEqual(a.attemptHistory ?? [], b.attemptHistory ?? []);

const isFirestoreAdvanced = (
  firestore: SyncableWordData,
  queued: SyncableWordData
): boolean => {
  if (
    firestore.totalAttempts < queued.totalAttempts ||
    firestore.correctCount < queued.correctCount
  ) {
    return false;
  }
  return (
    firestore.totalAttempts > queued.totalAttempts ||
    firestore.correctCount > queued.correctCount
  );
};

export const isQueueItemStale = (
  firestore: SyncableWordData,
  queued: SyncableWordData
): boolean => {
  if (isFirestoreAdvanced(firestore, queued)) {
    return true;
  }
  if (
    firestore.totalAttempts !== queued.totalAttempts ||
    firestore.correctCount !== queued.correctCount
  ) {
    return false;
  }
  return isSyncableDataEqual(firestore, queued);
};

export const mergeSnapshotIntoStore = (
  store: Words,
  snapshot: {
    docs: Array<{ id: string; data: () => DocumentData }>;
  },
  pending: PendingWordUpdate[] = []
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
    if (!firestoreWord || isFirestoreAdvanced(firestoreWord, item.data)) {
      continue;
    }

    const merged: WordData = {
      ...firestoreWord,
      correctCount: item.data.correctCount,
      totalAttempts: item.data.totalAttempts,
      inputTimes: item.data.inputTimes,
      lastPracticedAt: new Date(item.practicedAt),
    };
    if (item.data.correctPracticeDates !== undefined) {
      merged.correctPracticeDates = item.data.correctPracticeDates;
    }
    if (item.data.attemptHistory !== undefined) {
      merged.attemptHistory = item.data.attemptHistory;
    }
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
