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
  writeBatch,
  type WriteBatch,
} from "firebase/firestore";
import { db, getEffectiveUserId } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { SyncQueueManager } from "@/lib/syncQueue";
import { toast } from "@/hooks/useToast";
import { getCurrentLocale, t, type TranslationKey } from "@/lib/i18n";
import {
  Words,
  isQueueItemStale,
  mergeSnapshotIntoStore,
} from "@/lib/wordsStore";
import { buildAttemptQueueData, buildWordUpdates } from "@/lib/wordSync";

const tError = (key: TranslationKey) => t(key, getCurrentLocale());

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

const words = new Words();

interface WordsContextValue {
  words: Words;
  addWord: (word: string, translation: string) => Promise<void>;
  deleteWord: (word: string) => Promise<void>;
  recordCorrectAttempt: (word: string, inputTimeSeconds?: number) => void;
  recordIncorrectAttempt: (word: string) => void;
  syncToFirestore: () => Promise<void>;
  resetPracticeRecords: () => Promise<void>;
  updateTranslations: (
    updates: Array<{ word: string; translation: string }>
  ) => Promise<void>;
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
  const storageWarnedRef = useRef(false);
  const wordsLoadedRef = useRef(false);

  const notifyIfStorageFallback = useCallback(() => {
    if (storageWarnedRef.current) return;
    if (!SyncQueueManager.hasMemoryFallback()) return;
    storageWarnedRef.current = true;
    toast({
      title: tError("sync.storageFailed"),
      variant: "destructive",
    });
  }, []);

  useEffect(() => {
    if (!user) {
      SyncQueueManager.setUser(null);
      words.removeAllWords();
      words.userInputs.clear();
      wordsLoadedRef.current = false;
      setPendingCount(0);
      setLoading(false);
      return;
    }

    SyncQueueManager.setUser(getEffectiveUserId(user));
    wordsLoadedRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const userId = getEffectiveUserId(user);
      const wordsCollection = collection(db, "users", userId, "words");

      return onSnapshot(
        wordsCollection,
        (snapshot) => {
          const queue = SyncQueueManager.getQueue();
          const merged = mergeSnapshotIntoStore(
            words,
            snapshot,
            queue.map((item) => ({
              wordId: item.wordId,
              data: item.data,
              practicedAt: item.timestamp,
            }))
          );

          // Clean up stale sync queue items
          // If Firestore data matches or exceeds queue data, remove from queue
          if (queue.length > 0) {
            const staleIds = new Set<string>();
            queue.forEach((item) => {
              const firestoreWord = merged.byId.get(item.wordId);
              if (firestoreWord && isQueueItemStale(firestoreWord, item.data)) {
                staleIds.add(item.id);
              }
            });

            if (staleIds.size > 0) {
              SyncQueueManager.removeFromQueue(Array.from(staleIds));
              setPendingCount(SyncQueueManager.getUniqueWordCount());
            }
          }

          wordsLoadedRef.current = true;
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
          attemptHistory: [],
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

        const queue = SyncQueueManager.getQueue();
        const removedIds = queue
          .filter((item) => item.wordId === wordId)
          .map((item) => item.id);
        if (removedIds.length > 0) {
          SyncQueueManager.removeFromQueue(removedIds);
          setPendingCount(SyncQueueManager.getUniqueWordCount());
        }
      } catch (err) {
        console.error("Failed to delete word:", err);
        throw new Error(tError("error.deleteWordFailed"));
      }
    },
    [user]
  );

  const enqueueAttempt = useCallback(
    (word: string) => {
      const wordId = words.getWordId(word);
      const data = words.getWordData(word);
      if (!wordId || !data) return;

      SyncQueueManager.addToQueue({
        type: "attempt",
        word,
        wordId,
        data: buildAttemptQueueData(data),
      });
      notifyIfStorageFallback();
      setPendingCount(SyncQueueManager.getUniqueWordCount());
    },
    [notifyIfStorageFallback]
  );

  const recordCorrectAttempt = useCallback(
    (word: string, inputTimeSeconds?: number) => {
      words.recordCorrectAttempt(word, inputTimeSeconds);
      enqueueAttempt(word);
    },
    [enqueueAttempt]
  );

  const recordIncorrectAttempt = useCallback(
    (word: string) => {
      words.recordIncorrectAttempt(word);
      enqueueAttempt(word);
    },
    [enqueueAttempt]
  );

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
      const updates = buildWordUpdates(queue);
      const updateEntries = Array.from(updates.entries());
      for (let i = 0; i < updateEntries.length; i += FIRESTORE_BATCH_LIMIT) {
        const chunk = updateEntries.slice(i, i + FIRESTORE_BATCH_LIMIT);
        const batch = writeBatch(db);

        chunk.forEach(([wordId, { data, lastPracticedAt }]) => {
          const wordDocRef = doc(db, "users", userId, "words", wordId);
          batch.update(wordDocRef, {
            correctCount: data.correctCount,
            totalAttempts: data.totalAttempts,
            inputTimes: data.inputTimes,
            ...(data.correctPracticeDates !== undefined && {
              correctPracticeDates: data.correctPracticeDates,
            }),
            ...(data.attemptHistory !== undefined && {
              attemptHistory: data.attemptHistory,
            }),
            lastPracticedAt: new Date(lastPracticedAt),
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

          const wordWasDeleted =
            (error as { code?: string }).code === "not-found" &&
            wordsLoadedRef.current;
          const goneQueueItemIds: string[] = [];
          const retryQueueItemIds: string[] = [];

          chunk.forEach(([, update]) => {
            if (wordWasDeleted && !words.wordData.has(update.word)) {
              goneQueueItemIds.push(...update.queueItemIds);
            } else {
              retryQueueItemIds.push(...update.queueItemIds);
            }
          });

          if (goneQueueItemIds.length > 0) {
            SyncQueueManager.removeFromQueue(goneQueueItemIds);
          }

          const discarded = SyncQueueManager.incrementRetries(
            retryQueueItemIds
          );
          if (discarded.length > 0) {
            toast({
              title: tError("sync.dataLost"),
              variant: "destructive",
            });
          }
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

  const updateTranslations = useCallback(
    async (updates: Array<{ word: string; translation: string }>) => {
      if (!user) {
        throw new Error(tError("error.notAuthenticated"));
      }

      if (updates.length === 0) return;

      const userId = getEffectiveUserId(user);
      const entries = updates
        .map(({ word, translation }) => {
          const data = words.wordData.get(word);
          const wordId = data?.id;
          if (!data || !wordId) return null;
          return { word, translation, data, wordId };
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null
        );

      if (entries.length === 0) return;

      try {
        entries.forEach(({ word, translation, data }) => {
          words.setWordData(word, { ...data, translation });
        });

        await commitBatchOperations(
          entries.map(({ wordId, translation }) => (batch) => {
            batch.update(doc(db, "users", userId, "words", wordId), {
              translation,
            });
          })
        );
      } catch (err) {
        console.error("Failed to update translations:", err);
        throw new Error(tError("error.updateTranslationFailed"));
      }
    },
    [user]
  );

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
        data.attemptHistory = [];
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
            attemptHistory: [],
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
      recordCorrectAttempt,
      recordIncorrectAttempt,
      syncToFirestore,
      resetPracticeRecords,
      updateTranslations,
      loading,
      error,
      syncing,
      pendingCount,
    }),
    [
      addWord,
      deleteWord,
      recordCorrectAttempt,
      recordIncorrectAttempt,
      syncToFirestore,
      resetPracticeRecords,
      updateTranslations,
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
