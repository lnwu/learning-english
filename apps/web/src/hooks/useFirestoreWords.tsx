"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useContext,
  useRef,
  createContext,
  type FC,
  type ReactNode,
} from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDocs,
  updateDoc,
  writeBatch,
  type WriteBatch,
  type DocumentData,
} from "firebase/firestore";
import { db, getEffectiveUserId } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { makeAutoObservable } from "mobx";
import { SyncQueueManager } from "@/lib/syncQueue";
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
import { getCurrentLocale, t, type TranslationKey } from "@/lib/i18n";

const tError = (key: TranslationKey) => t(key, getCurrentLocale());

interface WordData {
  word: string;
  translation: string;
  correctCount: number;
  totalAttempts: number;
  inputTimes: number[];
  lastPracticedAt: Date | null;
  correctPracticeDates: string[];
  createdAt: Date;
  id: string;
}

export class Words {
  static MAX_RANDOM_WORDS = 5;
  static MAX_INPUT_TIMES = 20;
  static MAX_CORRECT_PRACTICE_DATES = 30;

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

  // 增量更新单个单词的数据（新增或替换），只使该词的缓存失效
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

  // Record a correct attempt with input time
  recordCorrectAttempt(word: string, inputTimeSeconds: number) {
    const data = this.wordData.get(word);
    if (!data) return;

    data.totalAttempts += 1;
    data.correctCount += 1;
    data.inputTimes.push(inputTimeSeconds);
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

  // Record an incorrect attempt (hint revealed)
  recordIncorrectAttempt(word: string) {
    const data = this.wordData.get(word);
    if (!data) return;

    data.totalAttempts += 1;
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

  // Get mastery score for a word (0-100)
  getMasteryScore(word: string): number {
    const data = this.wordData.get(word);
    if (!data) return 0;
    return this.#getMastery(word, data).score;
  }

  // Get detailed mastery result for a word
  getMasteryResult(word: string): MasteryResult | null {
    const data = this.wordData.get(word);
    if (!data) return null;
    return this.#getMastery(word, data);
  }

  // Get mastery level index (0-4) for UI display
  getMasteryLevelIndex(word: string): number {
    return getMasteryLevelIndex(this.getMasteryScore(word));
  }

  // Get input times for a word
  getInputTimes(word: string): number[] {
    return this.wordData.get(word)?.inputTimes ?? [];
  }

  // Get average input time for a word
  getAverageInputTime(word: string): number | null {
    const times = this.getInputTimes(word);
    if (times.length === 0) return null;
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  // Get overall average input time across all words
  get overallAverageInputTime(): number | null {
    const allTimes: number[] = [];
    this.wordData.forEach((data) => {
      allTimes.push(...data.inputTimes);
    });
    if (allTimes.length === 0) return null;
    return allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length;
  }

  // Get word length category: 0 (≤5), 1 (6-10), 2 (>10)
  getWordLengthCategory(word: string): number {
    const length = word.length;
    if (length <= 5) return 0;
    if (length <= 10) return 1;
    return 2;
  }

  // Get average input time for each word length category
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

  // Get total attempts for a word
  getTotalAttempts(word: string): number {
    return this.wordData.get(word)?.totalAttempts ?? 0;
  }

  // Get correct count for a word
  getCorrectCount(word: string): number {
    return this.wordData.get(word)?.correctCount ?? 0;
  }

  // Get word data for syncing
  getWordData(word: string): WordData | undefined {
    return this.wordData.get(word);
  }

  getWordId(word: string): string | undefined {
    return this.wordData.get(word)?.id;
  }

  getTranslation(word: string): string | undefined {
    return this.wordData.get(word)?.translation;
  }

  updateTranslation(word: string, translation: string) {
    const data = this.wordData.get(word);
    if (!data) return;
    data.translation = translation;
  }

  setUserInput(word: string, value: string) {
    this.userInputs.set(word, value);
  }

  // Get random words weighted by practice priority
  getRandomWords(max: number = Words.MAX_RANDOM_WORDS): [string, string][] {
    const wordEntries = Array.from(this.wordData.entries());
    if (wordEntries.length === 0) {
      return [];
    }

    // Calculate priority for each word (cached)
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
      // Random selection based on priority
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

const FIRESTORE_BATCH_LIMIT = 500;

const commitBatchOperations = async (
  operations: Array<(batch: WriteBatch) => void>
) => {
  for (let i = 0; i < operations.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations
      .slice(i, i + FIRESTORE_BATCH_LIMIT)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
};

const parseWordDoc = (id: string, data: DocumentData): WordData => {
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
    createdAt: data.createdAt?.toDate() ?? new Date(),
    id,
  };
};

const isWordDataEqual = (a: WordData, b: WordData) => {
  if (
    a.id !== b.id ||
    a.translation !== b.translation ||
    a.correctCount !== b.correctCount ||
    a.totalAttempts !== b.totalAttempts ||
    a.lastPracticedAt?.getTime() !== b.lastPracticedAt?.getTime() ||
    a.createdAt?.getTime() !== b.createdAt?.getTime() ||
    a.inputTimes.length !== b.inputTimes.length ||
    a.correctPracticeDates.length !== b.correctPracticeDates.length
  ) {
    return false;
  }
  return (
    a.inputTimes.every((time, i) => time === b.inputTimes[i]) &&
    a.correctPracticeDates.every(
      (date, i) => date === b.correctPracticeDates[i]
    )
  );
};

// 增量合并快照与本地 store，仅更新发生变化的单词，避免全量替换导致所有 observer 重渲染
const mergeSnapshotIntoStore = (snapshot: {
  docs: Array<{ id: string; data: () => DocumentData }>;
}) => {
  const incoming = new Map<string, WordData>();
  snapshot.docs.forEach((doc) => {
    incoming.set(doc.data().word, parseWordDoc(doc.id, doc.data()));
  });

  let changed = false;

  for (const word of Array.from(words.wordData.keys())) {
    if (!incoming.has(word)) {
      words.deleteWord(word);
      changed = true;
    }
  }

  for (const [word, data] of incoming) {
    const existing = words.wordData.get(word);
    if (!existing) {
      words.setWordData(word, data);
      changed = true;
    } else if (!isWordDataEqual(existing, data)) {
      words.setWordData(word, data);
      changed = true;
    }
  }

  if (changed) words.invalidateCaches();
};

const words = new Words();

interface WordsContextValue {
  words: Words;
  addWord: (word: string, translation: string) => Promise<void>;
  deleteWord: (word: string) => Promise<void>;
  updateTranslation: (word: string, translation: string) => Promise<void>;
  removeAllWords: () => Promise<void>;
  recordCorrectAttempt: (word: string, inputTimeSeconds: number) => void;
  recordIncorrectAttempt: (word: string) => void;
  syncToFirestore: () => Promise<void>;
  resetPracticeRecords: () => Promise<void>;
  loading: boolean;
  error: string | null;
  syncing: boolean;
  pendingCount: number;
}

const WordsContext = createContext<WordsContextValue | null>(null);

export const WordsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userId = getEffectiveUserId(user);
      const wordsCollection = collection(db, "users", userId, "words");

      return onSnapshot(
        wordsCollection,
        (snapshot) => {
          mergeSnapshotIntoStore(snapshot);

          // Clean up stale sync queue items
          // If Firestore data matches or exceeds queue data, remove from queue
          const queue = SyncQueueManager.getQueue();
          if (queue.length > 0) {
            const wordsById = new Map(
              snapshot.docs.map((doc) => [doc.id, parseWordDoc(doc.id, doc.data())])
            );
            const staleIds = new Set<string>();
            queue.forEach((item) => {
              const firestoreWord = wordsById.get(item.wordId);
              // If Firestore has same or newer data, this queue item is stale
              if (
                firestoreWord &&
                firestoreWord.totalAttempts >= item.data.totalAttempts &&
                firestoreWord.correctCount >= item.data.correctCount
              ) {
                staleIds.add(item.id);
              }
            });

            if (staleIds.size > 0) {
              SyncQueueManager.saveQueue(
                queue.filter((item) => !staleIds.has(item.id))
              );
              setPendingCount(SyncQueueManager.getUniqueWordCount());
            }
          }

          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error("Firestore error:", err);
          setError(tError("error.loadWordsFailed"));
          setLoading(false);
        }
      );
    } catch (err) {
      console.error("Firebase Auth error:", err);
      setError(tError("error.authFailed"));
      setLoading(false);
    }
  }, [user]);

  const addWord = useCallback(
    async (word: string, translation: string) => {
      if (!user) {
        throw new Error(tError("error.notAuthenticated"));
      }

      try {
        const userId = getEffectiveUserId(user);
        const wordsCollection = collection(db, "users", userId, "words");

        await addDoc(wordsCollection, {
          word,
          translation,
          correctCount: 0,
          totalAttempts: 0,
          inputTimes: [],
          lastPracticedAt: null,
          correctPracticeDates: [],
          createdAt: new Date(),
        });
      } catch (err) {
        console.error("Failed to add word:", err);
        throw new Error(`${tError("addWord.addFailed")}${err}`);
      }
    },
    [user]
  );

  const deleteWord = useCallback(
    async (word: string) => {
      if (!user) {
        throw new Error(tError("error.notAuthenticated"));
      }

      const wordId = words.getWordId(word);
      if (!wordId) {
        throw new Error(tError("error.wordNotFound"));
      }

      try {
        const userId = getEffectiveUserId(user);
        await deleteDoc(doc(db, "users", userId, "words", wordId));
      } catch (err) {
        console.error("Failed to delete word:", err);
        throw new Error(tError("error.deleteWordFailed"));
      }
    },
    [user]
  );

  const updateTranslation = useCallback(
    async (word: string, translation: string) => {
      if (!user) {
        throw new Error(tError("error.notAuthenticated"));
      }

      const wordId = words.getWordId(word);
      if (!wordId) {
        throw new Error(tError("error.wordNotFound"));
      }

      try {
        const userId = getEffectiveUserId(user);
        const wordDocRef = doc(db, "users", userId, "words", wordId);
        await updateDoc(wordDocRef, {
          translation,
        });

        words.updateTranslation(word, translation);
      } catch (err) {
        console.error("Failed to update translation:", err);
        throw new Error(tError("error.updateTranslationFailed"));
      }
    },
    [user]
  );

  const removeAllWords = useCallback(async () => {
    if (!user) {
      throw new Error(tError("error.notAuthenticated"));
    }

    const userId = getEffectiveUserId(user);
    const wordsCollection = collection(db, "users", userId, "words");

    try {
      const querySnapshot = await getDocs(wordsCollection);
      await commitBatchOperations(
        querySnapshot.docs.map((document) => (batch) => batch.delete(document.ref))
      );
    } catch (err) {
      console.error("Failed to remove all words:", err);
      throw new Error(tError("error.removeWordsFailed"));
    }
  }, [user]);

  const recordCorrectAttempt = useCallback(
    (word: string, inputTimeSeconds: number) => {
      words.recordCorrectAttempt(word, inputTimeSeconds);

      const wordId = words.getWordId(word);
      const data = words.getWordData(word);
      if (wordId && data) {
        SyncQueueManager.addToQueue({
          type: "attempt",
          word,
          wordId,
          data: {
            correctCount: data.correctCount,
            totalAttempts: data.totalAttempts,
            inputTimes: data.inputTimes,
            correctPracticeDates: data.correctPracticeDates,
          },
        });
        setPendingCount(SyncQueueManager.getUniqueWordCount());
      }
    },
    []
  );

  const recordIncorrectAttempt = useCallback((word: string) => {
    words.recordIncorrectAttempt(word);

    const wordId = words.getWordId(word);
    const data = words.getWordData(word);
    if (wordId && data) {
      SyncQueueManager.addToQueue({
        type: "attempt",
        word,
        wordId,
        data: {
          correctCount: data.correctCount,
          totalAttempts: data.totalAttempts,
          inputTimes: data.inputTimes,
          correctPracticeDates: data.correctPracticeDates,
        },
      });
      setPendingCount(SyncQueueManager.getUniqueWordCount());
    }
  }, []);

  const syncToFirestore = useCallback(async () => {
    if (!user) {
      console.warn("User not authenticated, skipping sync");
      return;
    }

    // 防止定时器/页面可见性/网络恢复/手动触发并发执行导致队列竞争
    if (syncingRef.current) {
      return;
    }

    const queue = SyncQueueManager.getQueue();
    if (queue.length === 0) {
      return;
    }

    syncingRef.current = true;
    setSyncing(true);

    try {
      const userId = getEffectiveUserId(user);

      const updates: Map<
        string,
        {
          data: {
            correctCount: number;
            totalAttempts: number;
            inputTimes: number[];
            correctPracticeDates?: string[];
          };
          queueItemIds: string[];
        }
      > = new Map();

      queue.forEach((item) => {
        const existing = updates.get(item.wordId);
        if (existing) {
          existing.data = item.data;
          existing.queueItemIds.push(item.id);
        } else {
          updates.set(item.wordId, {
            data: item.data,
            queueItemIds: [item.id],
          });
        }
      });

      const updateEntries = Array.from(updates.entries());
      for (let i = 0; i < updateEntries.length; i += FIRESTORE_BATCH_LIMIT) {
        const chunk = updateEntries.slice(i, i + FIRESTORE_BATCH_LIMIT);
        const batch = writeBatch(db);

        chunk.forEach(([wordId, { data }]) => {
          const wordDocRef = doc(db, "users", userId, "words", wordId);
          batch.update(wordDocRef, {
            correctCount: data.correctCount,
            totalAttempts: data.totalAttempts,
            inputTimes: data.inputTimes,
            ...(data.correctPracticeDates !== undefined && {
              correctPracticeDates: data.correctPracticeDates,
            }),
            lastPracticedAt: new Date(),
          });
        });

        const queueItemIds = chunk.flatMap(
          ([, { queueItemIds }]) => queueItemIds
        );

        try {
          await batch.commit();
          SyncQueueManager.removeFromQueue(queueItemIds);
        } catch (error) {
          console.error("Failed to sync batch:", error);
          SyncQueueManager.incrementRetries(queueItemIds);
        }
      }

      setPendingCount(SyncQueueManager.getUniqueWordCount());
    } catch (error) {
      console.error("Sync failed:", error);
      setPendingCount(SyncQueueManager.getUniqueWordCount());
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    setPendingCount(SyncQueueManager.getUniqueWordCount());

    const SYNC_INTERVAL = 30 * 1000;
    const timer = setInterval(() => syncToFirestore(), SYNC_INTERVAL);

    syncToFirestore();

    return () => clearInterval(timer);
  }, [user, syncToFirestore]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncToFirestore();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [syncToFirestore]);

  useEffect(() => {
    const handleOnline = () => {
      syncToFirestore();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncToFirestore]);

  const resetPracticeRecords = useCallback(async () => {
    if (!user) {
      throw new Error(tError("error.notAuthenticated"));
    }

    try {
      const userId = getEffectiveUserId(user);

      words.wordData.forEach((data) => {
        data.correctCount = 0;
        data.totalAttempts = 0;
        data.inputTimes = [];
        data.lastPracticedAt = null;
        data.correctPracticeDates = [];
      });
      words.invalidateCaches();

      await commitBatchOperations(
        Array.from(words.wordData.values()).map((data) => (batch) => {
          const wordDocRef = doc(db, "users", userId, "words", data.id);
          batch.update(wordDocRef, {
            correctCount: 0,
            totalAttempts: 0,
            inputTimes: [],
            lastPracticedAt: null,
            correctPracticeDates: [],
          });
        })
      );

      SyncQueueManager.clearQueue();
      setPendingCount(0);
    } catch (err) {
      console.error("Failed to reset practice records:", err);
      throw new Error(tError("error.resetFailed"));
    }
  }, [user]);

  const value = useMemo<WordsContextValue>(
    () => ({
      words,
      addWord,
      deleteWord,
      updateTranslation,
      removeAllWords,
      recordCorrectAttempt,
      recordIncorrectAttempt,
      syncToFirestore,
      resetPracticeRecords,
      loading,
      error,
      syncing,
      pendingCount,
    }),
    [
      addWord,
      deleteWord,
      updateTranslation,
      removeAllWords,
      recordCorrectAttempt,
      recordIncorrectAttempt,
      syncToFirestore,
      resetPracticeRecords,
      loading,
      error,
      syncing,
      pendingCount,
    ]
  );

  return (
    <WordsContext.Provider value={value}>{children}</WordsContext.Provider>
  );
};

export const useFirestoreWords = (): WordsContextValue => {
  const context = useContext(WordsContext);
  if (!context) {
    throw new Error("useFirestoreWords must be used within WordsProvider");
  }
  return context;
};
