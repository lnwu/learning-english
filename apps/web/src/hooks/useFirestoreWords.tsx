"use client";

import {
  useMemo,
  useContext,
  createContext,
  type FC,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWordsSync } from "@/hooks/useWordsSync";
import { useWordActions } from "@/hooks/useWordActions";
import { getEffectiveUserId } from "@/lib/firebase";
import { createWordsRepo, type WordsRepo } from "@/lib/wordsRepo";
import { Words } from "@/lib/wordsStore";

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
  normalizeWordForms: (
    renames: Array<{ from: string; to: string }>
  ) => Promise<{ renamed: number; merged: number }>;
  loading: boolean;
  error: string | null;
}

interface SyncStatusValue {
  syncing: boolean;
  pendingCount: number;
}

const WordsContext = createContext<WordsContextValue | null>(null);
const SyncStatusContext = createContext<SyncStatusValue | null>(null);
const WordsRepoContext = createContext<WordsRepo | null>(null);

export const WordsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const repo = useMemo(
    () => (user ? createWordsRepo(getEffectiveUserId(user)) : null),
    [user]
  );
  const {
    loading,
    error,
    syncing,
    pendingCount,
    syncToFirestore,
    recordCorrectAttempt,
    recordIncorrectAttempt,
    refreshPendingCount,
  } = useWordsSync(words, repo);
  const {
    addWord,
    deleteWord,
    updateTranslations,
    normalizeWordForms,
    resetPracticeRecords,
  } = useWordActions(words, repo, {
    syncToFirestore,
    refreshPendingCount,
  });

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
      normalizeWordForms,
      loading,
      error,
    }),
    [
      addWord,
      deleteWord,
      recordCorrectAttempt,
      recordIncorrectAttempt,
      syncToFirestore,
      resetPracticeRecords,
      updateTranslations,
      normalizeWordForms,
      loading,
      error,
    ]
  );

  const syncStatus = useMemo<SyncStatusValue>(
    () => ({ syncing, pendingCount }),
    [syncing, pendingCount]
  );

  return (
    <WordsContext.Provider value={value}>
      <SyncStatusContext.Provider value={syncStatus}>
        <WordsRepoContext.Provider value={repo}>
          {children}
        </WordsRepoContext.Provider>
      </SyncStatusContext.Provider>
    </WordsContext.Provider>
  );
};

export const useFirestoreWords = (): WordsContextValue => {
  const context = useContext(WordsContext);
  if (!context) {
    throw new Error("useFirestoreWords must be used within WordsProvider");
  }
  return context;
};

export const useSyncStatus = (): SyncStatusValue => {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error("useSyncStatus must be used within WordsProvider");
  }
  return context;
};

export const useWordsRepo = (): WordsRepo | null =>
  useContext(WordsRepoContext);
