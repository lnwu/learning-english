"use client";

import { useCallback } from "react";
import { SyncQueueManager } from "@/lib/syncQueue";
import { tNow } from "@/lib/i18n";
import { type Words } from "@/lib/wordsStore";
import { buildNormalizeDocPlan } from "@/lib/wordNormalization";
import { resetPracticeFields } from "@/lib/wordDoc";
import type { WordsRepo } from "@/lib/wordsRepo";

export const useWordActions = (
  words: Words,
  repo: WordsRepo | null,
  options: {
    syncToFirestore: () => Promise<void>;
    refreshPendingCount: () => void;
  }
) => {
  const { syncToFirestore, refreshPendingCount } = options;

  const addWord = useCallback(
    async (word: string, translation: string) => {
      if (!repo) {
        throw new Error(tNow("error.notAuthenticated"));
      }

      try {
        await repo.addWord(word, translation);
      } catch (err) {
        console.error("Failed to add word:", err);
        throw new Error(`${tNow("addWord.addFailed")}${err}`);
      }
    },
    [repo]
  );

  const deleteWord = useCallback(
    async (word: string) => {
      if (!repo) {
        throw new Error(tNow("error.notAuthenticated"));
      }

      const wordId = words.getWordId(word);
      if (!wordId) {
        throw new Error(tNow("error.wordNotFound"));
      }

      try {
        await repo.deleteWord(wordId);

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
    [repo, words, refreshPendingCount]
  );

  const updateTranslations = useCallback(
    async (updates: Array<{ word: string; translation: string }>) => {
      if (!repo) {
        throw new Error(tNow("error.notAuthenticated"));
      }

      if (updates.length === 0) return;

      const entries = updates
        .map(({ word, translation }) => {
          const data = words.getWordData(word);
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

        await repo.commitWordOperations(
          entries.map(({ wordId, translation }) => ({
            type: "update" as const,
            wordId,
            fields: { translation },
          }))
        );
      } catch (err) {
        console.error("Failed to update translations:", err);
        throw new Error(tNow("error.updateTranslationFailed"));
      }
    },
    [repo, words]
  );

  const normalizeWordForms = useCallback(
    async (renames: Array<{ from: string; to: string }>) => {
      if (!repo) {
        throw new Error(tNow("error.notAuthenticated"));
      }

      const plan = renames.filter(
        ({ from, to }) => from !== to && words.hasWord(from)
      );
      if (plan.length === 0) return { renamed: 0, merged: 0 };

      try {
        await syncToFirestore();

        const docPlan = buildNormalizeDocPlan(plan, (word) =>
          words.getWordData(word)
        );

        if (docPlan.operations.length > 0) {
          await repo.commitWordOperations(docPlan.operations);
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
    [repo, syncToFirestore, words]
  );

  const resetPracticeRecords = useCallback(async () => {
    if (!repo) {
      throw new Error(tNow("error.notAuthenticated"));
    }

    try {
      const resetDocs = words.resetPracticeRecords();

      await repo.commitWordOperations(
        resetDocs.map((data) => ({
          type: "update" as const,
          wordId: data.id,
          fields: resetPracticeFields(),
        }))
      );

      SyncQueueManager.clearQueue();
      refreshPendingCount();
    } catch (err) {
      console.error("Failed to reset practice records:", err);
      throw new Error(tNow("error.resetFailed"));
    }
  }, [repo, words, refreshPendingCount]);

  return {
    addWord,
    deleteWord,
    updateTranslations,
    normalizeWordForms,
    resetPracticeRecords,
  };
};
