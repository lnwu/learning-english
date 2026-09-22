"use client";

import { useCallback } from "react";
import type { User } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, type WriteBatch } from "firebase/firestore";
import { db, getEffectiveUserId } from "@/lib/firebase";
import { SyncQueueManager } from "@/lib/syncQueue";
import { tNow } from "@/lib/i18n";
import { type Words } from "@/lib/wordsStore";
import { buildNormalizeDocPlan } from "@/lib/wordNormalization";
import { commitBatchOperations } from "@/lib/firestoreBatch";

export const useWordActions = (
  words: Words,
  user: User | null,
  options: {
    syncToFirestore: () => Promise<void>;
    refreshPendingCount: () => void;
  }
) => {
  const { syncToFirestore, refreshPendingCount } = options;

  const addWord = useCallback(
    async (word: string, translation: string) => {
      if (!user) {
        throw new Error(tNow("error.notAuthenticated"));
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
        throw new Error(`${tNow("addWord.addFailed")}${err}`);
      }
    },
    [user]
  );

  const deleteWord = useCallback(
    async (word: string) => {
      if (!user) {
        throw new Error(tNow("error.notAuthenticated"));
      }

      const wordId = words.getWordId(word);
      if (!wordId) {
        throw new Error(tNow("error.wordNotFound"));
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
          refreshPendingCount();
        }
      } catch (err) {
        console.error("Failed to delete word:", err);
        throw new Error(tNow("error.deleteWordFailed"));
      }
    },
    [user, words, refreshPendingCount]
  );

  const updateTranslations = useCallback(
    async (updates: Array<{ word: string; translation: string }>) => {
      if (!user) {
        throw new Error(tNow("error.notAuthenticated"));
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
        throw new Error(tNow("error.updateTranslationFailed"));
      }
    },
    [user, words]
  );

  const normalizeWordForms = useCallback(
    async (renames: Array<{ from: string; to: string }>) => {
      if (!user) {
        throw new Error(tNow("error.notAuthenticated"));
      }

      const plan = renames.filter(
        ({ from, to }) => from !== to && words.wordData.has(from)
      );
      if (plan.length === 0) return { renamed: 0, merged: 0 };

      try {
        const userId = getEffectiveUserId(user);

        await syncToFirestore();

        const docPlan = buildNormalizeDocPlan(plan, (word) =>
          words.wordData.get(word)
        );

        const operations = docPlan.operations.map((operation) => {
          const wordDocRef = doc(
            db,
            "users",
            userId,
            "words",
            operation.wordId
          );
          if (operation.type === "deleteWord") {
            return (batch: WriteBatch) => batch.delete(wordDocRef);
          }
          if (operation.type === "renameWord") {
            return (batch: WriteBatch) =>
              batch.update(wordDocRef, { word: operation.word });
          }
          return (batch: WriteBatch) =>
            batch.update(wordDocRef, operation.fields);
        });

        if (operations.length > 0) {
          await commitBatchOperations(operations);
        }
        docPlan.storeUpdates.forEach(({ from, to, data }) => {
          words.moveWord(from, to, data);
        });

        return { renamed: docPlan.renamed, merged: docPlan.merged };
      } catch (err) {
        console.error("Failed to normalize word forms:", err);
        throw new Error(tNow("error.normalizeWordFailed"));
      }
    },
    [user, syncToFirestore, words]
  );

  const resetPracticeRecords = useCallback(async () => {
    if (!user) {
      throw new Error(tNow("error.notAuthenticated"));
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
      refreshPendingCount();
    } catch (err) {
      console.error("Failed to reset practice records:", err);
      throw new Error(tNow("error.resetFailed"));
    }
  }, [user, words, refreshPendingCount]);

  return {
    addWord,
    deleteWord,
    updateTranslations,
    normalizeWordForms,
    resetPracticeRecords,
  };
};
