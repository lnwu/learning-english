"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { collection, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { db, getEffectiveUserId } from "@/lib/firebase";
import { SyncQueueManager } from "@/lib/syncQueue";
import { toast } from "@/hooks/useToast";
import { tNow } from "@/lib/i18n";
import {
  mergeSnapshotIntoStore,
  type Words,
} from "@/lib/wordsStore";
import {
  buildAttemptQueueData,
  buildAttemptUpdateFields,
  buildWordUpdates,
  collectStaleQueueItemIds,
  runWordSync,
} from "@/lib/wordSync";
import { FIRESTORE_BATCH_LIMIT } from "@/lib/firestoreBatch";

export const useWordsSync = (words: Words, user: User | null) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);
  const storageWarnedRef = useRef(false);
  const wordsLoadedRef = useRef(false);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(SyncQueueManager.getUniqueWordCount());
  }, []);

  const notifyIfStorageFallback = useCallback(() => {
    if (storageWarnedRef.current) return;
    if (!SyncQueueManager.hasMemoryFallback()) return;
    storageWarnedRef.current = true;
    toast({
      title: tNow("sync.storageFailed"),
      variant: "destructive",
    });
  }, []);

  useEffect(() => {
    if (!user) {
      SyncQueueManager.setUser(null);
      words.removeAllWords();
      words.clearUserInputs();
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

          const staleIds = collectStaleQueueItemIds(merged, queue);
          if (staleIds.length > 0) {
            SyncQueueManager.removeFromQueue(staleIds);
            refreshPendingCount();
          }

          wordsLoadedRef.current = true;
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error("Firestore error:", err);
          setError(tNow("error.loadWordsFailed"));
          setLoading(false);
        }
      );
    } catch (err) {
      console.error("Firebase Auth error:", err);
      setError(tNow("error.authFailed"));
      setLoading(false);
    }
  }, [user, words, refreshPendingCount]);

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
      refreshPendingCount();
    },
    [words, notifyIfStorageFallback, refreshPendingCount]
  );

  const recordCorrectAttempt = useCallback(
    (word: string, inputTimeSeconds?: number) => {
      words.recordCorrectAttempt(word, inputTimeSeconds);
      enqueueAttempt(word);
    },
    [words, enqueueAttempt]
  );

  const recordIncorrectAttempt = useCallback(
    (word: string) => {
      words.recordIncorrectAttempt(word);
      enqueueAttempt(word);
    },
    [words, enqueueAttempt]
  );

  const syncToFirestore = useCallback(async () => {
    if (!user) {
      console.warn("User not authenticated, skipping sync");
      return;
    }

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
      const result = await runWordSync({
        entries: Array.from(updates.entries()),
        chunkSize: FIRESTORE_BATCH_LIMIT,
        isWordsLoaded: () => wordsLoadedRef.current,
        wordExists: (word) => words.hasWord(word),
        writeChunk: async (chunk) => {
          const batch = writeBatch(db);
          chunk.forEach(([wordId, { data, lastPracticedAt }]) => {
            batch.update(
              doc(db, "users", userId, "words", wordId),
              buildAttemptUpdateFields(data, lastPracticedAt)
            );
          });
          await batch.commit();
        },
        queue: {
          remove: (ids) => SyncQueueManager.removeFromQueue(ids),
          incrementRetries: (ids) =>
            SyncQueueManager.incrementRetries(ids).map((item) => item.id),
        },
      });

      if (result.discarded.length > 0) {
        toast({
          title: tNow("sync.dataLost"),
          variant: "destructive",
        });
      }

      refreshPendingCount();
    } catch (error) {
      console.error("Sync failed:", error);
      refreshPendingCount();
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, [user, words, refreshPendingCount]);

  useEffect(() => {
    if (!user) return;

    refreshPendingCount();

    const SYNC_INTERVAL = 30 * 1000;
    const timer = setInterval(() => syncToFirestore(), SYNC_INTERVAL);

    syncToFirestore();

    return () => clearInterval(timer);
  }, [user, syncToFirestore, refreshPendingCount]);

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

  return {
    loading,
    error,
    syncing,
    pendingCount,
    syncToFirestore,
    recordCorrectAttempt,
    recordIncorrectAttempt,
    refreshPendingCount,
  };
};
