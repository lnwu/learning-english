import { makeAutoObservable } from "mobx";
import type { DocumentData } from "firebase/firestore";
import {
  calculateMasteryScore,
  calculatePriority,
  getMasteryLevelIndex,
  type MasteryResult,
} from "@/lib/masteryCalculator";
import {
  formatLocalPracticeDate,
  getLocalPracticeDate,
} from "@/lib/practiceDate";

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

export class Words {
  static MAX_RANDOM_WORDS = 5;
  static MAX_INPUT_TIMES = 20;
  static MAX_CORRECT_PRACTICE_DATES = 30;
  static MAX_ATTEMPT_HISTORY = 30;

  wordData: Map<string, WordData> = new Map();
  userInputs: Map<string, string> = new Map();
  #priorityCache = new Map<string, { masteryScore: number; priority: number }>();
  #masteryCache = new Map<string, MasteryResult>();

  constructor() {
    makeAutoObservable(this);
  }

  invalidateCaches() {
    this.#priorityCache.clear();
    this.#masteryCache.clear();
  }

  setWordData(word: string, data: WordData) {
    this.wordData.set(word, data);
    this.#priorityCache.delete(word);
    this.#masteryCache.delete(word);
  }

  addWord(word: string, translation: string, id: string) {
    this.wordData.set(word, {
      word,
      translation,
      correctCount: 0,
      totalAttempts: 0,
      inputTimes: [],
      lastPracticedAt: null,
      correctPracticeDates: [],
      attemptHistory: [],
      createdAt: new Date(),
      id,
    });
  }

  deleteWord(word: string) {
    this.wordData.delete(word);
    this.#priorityCache.delete(word);
    this.#masteryCache.delete(word);
  }

  removeAllWords() {
    this.wordData.clear();
    this.invalidateCaches();
  }

  recordCorrectAttempt(word: string, inputTimeSeconds?: number) {
    const data = this.wordData.get(word);
    if (!data) return;

    data.totalAttempts += 1;
    data.correctCount += 1;
    data.attemptHistory.push(true);
    if (data.attemptHistory.length > Words.MAX_ATTEMPT_HISTORY) {
      data.attemptHistory = data.attemptHistory.slice(-Words.MAX_ATTEMPT_HISTORY);
    }
    if (inputTimeSeconds !== undefined) {
      data.inputTimes.push(inputTimeSeconds);
    }
    const now = new Date();
    const today = formatLocalPracticeDate(now);
    if (!data.correctPracticeDates.includes(today)) {
      data.correctPracticeDates.push(today);
      if (data.correctPracticeDates.length > Words.MAX_CORRECT_PRACTICE_DATES) {
        data.correctPracticeDates = data.correctPracticeDates.slice(-Words.MAX_CORRECT_PRACTICE_DATES);
      }
    }

    if (data.inputTimes.length > Words.MAX_INPUT_TIMES) {
      data.inputTimes = data.inputTimes.slice(-Words.MAX_INPUT_TIMES);
    }

    data.lastPracticedAt = now;
    this.#priorityCache.delete(word);
    this.#masteryCache.delete(word);
  }

  recordIncorrectAttempt(word: string) {
    const data = this.wordData.get(word);
    if (!data) return;

    data.totalAttempts += 1;
    data.attemptHistory.push(false);
    if (data.attemptHistory.length > Words.MAX_ATTEMPT_HISTORY) {
      data.attemptHistory = data.attemptHistory.slice(-Words.MAX_ATTEMPT_HISTORY);
    }
    data.lastPracticedAt = new Date();
    this.#priorityCache.delete(word);
    this.#masteryCache.delete(word);
  }

  #getMastery(word: string, data: WordData): MasteryResult {
    let result = this.#masteryCache.get(word);
    if (!result) {
      result = calculateMasteryScore(data);
      this.#masteryCache.set(word, result);
    }
    return result;
  }

  getMasteryScore(word: string): number {
    const data = this.wordData.get(word);
    if (!data) return 0;
    return this.#getMastery(word, data).score;
  }

  getMasteryLevelIndex(word: string): number {
    return getMasteryLevelIndex(this.getMasteryScore(word));
  }

  get overallAverageInputTime(): number | null {
    const allTimes: number[] = [];
    this.wordData.forEach((data) => {
      allTimes.push(...data.inputTimes);
    });
    if (allTimes.length === 0) return null;
    return allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length;
  }

  getWordLengthCategory(word: string): number {
    const length = word.length;
    if (length <= 5) return 0;
    if (length <= 10) return 1;
    return 2;
  }

  get averageTimeByLengthCategory(): (number | null)[] {
    const categoryTimes: number[][] = [[], [], []];

    this.wordData.forEach((data, word) => {
      categoryTimes[this.getWordLengthCategory(word)].push(...data.inputTimes);
    });

    return categoryTimes.map((times) =>
      times.length === 0
        ? null
        : times.reduce((sum, time) => sum + time, 0) / times.length
    );
  }

  getWordData(word: string): WordData | undefined {
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

  getRandomWords(max: number = Words.MAX_RANDOM_WORDS): [string, string][] {
    const wordEntries = Array.from(this.wordData.entries());
    if (wordEntries.length === 0) {
      return [];
    }

    const wordsWithPriority = wordEntries.map(([word, data]) => {
      let entry = this.#priorityCache.get(word);
      if (!entry) {
        const masteryScore = this.#getMastery(word, data).score;
        const priority = calculatePriority(
          masteryScore,
          data.lastPracticedAt,
          data.totalAttempts
        );
        entry = { masteryScore, priority };
        this.#priorityCache.set(word, entry);
      }
      return { word, translation: data.translation, priority: entry.priority };
    });

    const selected: [string, string][] = [];
    const available = [...wordsWithPriority];
    let totalPriority = available.reduce(
      (sum, item) => sum + item.priority,
      0
    );

    for (let i = 0; i < Math.min(max, available.length); i++) {
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
      selected.push([selectedItem.word, selectedItem.translation]);
      available.splice(selectedIndex, 1);
      totalPriority -= selectedItem.priority;
    }

    return selected;
  }

  get practiceStats() {
    const stats: Array<{
      word: string;
      avgTime: number;
      count: number;
      masteryScore: number;
      correctCount: number;
      totalAttempts: number;
    }> = [];

    this.wordData.forEach((data, word) => {
      const times = data.inputTimes;
      const avg =
        times.length > 0
          ? times.reduce((sum, t) => sum + t, 0) / times.length
          : 0;
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

export const parseWordDoc = (id: string, data: DocumentData): WordData => {
  const inputTimes = data.inputTimes ?? [];
  const lastPracticedAt = data.lastPracticedAt?.toDate() ?? null;

  return {
    word: data.word,
    translation: data.translation,
    correctCount: data.correctCount ?? 0,
    totalAttempts: data.totalAttempts ?? 0,
    inputTimes,
    lastPracticedAt,
    correctPracticeDates: (data.correctPracticeDates ?? []).map(
      getLocalPracticeDate
    ),
    attemptHistory: (data.attemptHistory ?? []).map(Boolean),
    createdAt: data.createdAt?.toDate() ?? new Date(),
    id,
  };
};

export const isWordDataEqual = (a: WordData, b: WordData) => {
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
    a.inputTimes.every((time, i) => time === b.inputTimes[i]) &&
    a.correctPracticeDates.every(
      (date, i) => date === b.correctPracticeDates[i]
    ) &&
    a.attemptHistory.every((ok, i) => ok === b.attemptHistory[i])
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
): boolean => {
  const aDates = a.correctPracticeDates ?? [];
  const bDates = b.correctPracticeDates ?? [];
  const aHistory = a.attemptHistory ?? [];
  const bHistory = b.attemptHistory ?? [];
  return (
    a.correctCount === b.correctCount &&
    a.totalAttempts === b.totalAttempts &&
    a.inputTimes.length === b.inputTimes.length &&
    a.inputTimes.every((time, index) => time === b.inputTimes[index]) &&
    aDates.length === bDates.length &&
    aDates.every((date, index) => date === bDates[index]) &&
    aHistory.length === bHistory.length &&
    aHistory.every((flag, index) => flag === bHistory[index])
  );
};

export const isFirestoreAdvanced = (
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

  for (const word of Array.from(store.wordData.keys())) {
    if (!byWord.has(word)) {
      store.deleteWord(word);
    }
  }

  for (const [word, data] of byWord) {
    const existing = store.wordData.get(word);
    if (!existing) {
      store.setWordData(word, data);
    } else if (!isWordDataEqual(existing, data)) {
      store.setWordData(word, data);
    }
  }

  return { byWord, byId };
};
