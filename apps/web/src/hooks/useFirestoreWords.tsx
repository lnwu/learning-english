"use client";

import {
  useMemo,
  useCallback,
  useContext,
  createContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveUserId } from "@/lib/firebase";
import { createWordsRepo, type WordsRepo } from "@/lib/wordsRepo";
import { Words } from "@/lib/wordsStore";
import { WordsLedger } from "@/lib/wordsLedger";
import { createLocalStorageQueueStorage, createNoopQueueStorage } from "@/lib/queueStorage";
import { tNow } from "@/lib/i18n";
import { toast } from "@/hooks/useToast";
import { postJson } from "@/lib/apiClient";
import { decodeSenses, type WordSense } from "@/lib/wordSenses";
import type { ConfusableResult } from "@/lib/confusables";
import type { Rating } from "@/lib/masteryModel";

const words = new Words();
const SYNC_INTERVAL_MS = 30 * 1000;

interface WordsContextValue {
  words: Words;
  addWord: (word: string, senses: WordSense[]) => Promise<void>;
  deleteWord: (word: string) => Promise<void>;
  recordReview: (
    word: string,
    rating: Rating,
    options?: { hint?: boolean; inputTimeSeconds?: number },
  ) => void;
  syncToFirestore: () => Promise<void>;
  resetPracticeRecords: () => Promise<void>;
  updateTranslations: (updates: Array<{ word: string; senses: WordSense[] }>) => Promise<void>;
  refreshConfusables: (focus?: { word: string; senses: WordSense[] }) => Promise<number>;
  normalizeWordForms: (
    renames: Array<{ from: string; to: string }>,
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
  const repo = useMemo(() => (user ? createWordsRepo(getEffectiveUserId(user)) : null), [user]);
  const ledger = useMemo(
    () =>
      new WordsLedger({
        words,
        repo,
        queue: repo ? createLocalStorageQueueStorage(repo.userId) : createNoopQueueStorage(),
      }),
    [repo],
  );

  const status = useSyncExternalStore(ledger.subscribe, ledger.getStatus, ledger.getServerStatus);

  useEffect(() => ledger.start(), [ledger]);

  useEffect(() => {
    if (!repo) return;

    void ledger.sync();
    const timer = setInterval(() => {
      void ledger.sync();
    }, SYNC_INTERVAL_MS);

    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void ledger.sync();
    };
    const syncWhenOnline = () => {
      void ledger.sync();
    };

    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("online", syncWhenOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("online", syncWhenOnline);
    };
  }, [repo, ledger]);

  const storageWarnedRef = useRef(false);
  useEffect(() => {
    if (!status.storageFailed || storageWarnedRef.current) return;
    storageWarnedRef.current = true;
    toast({ title: tNow("sync.storageFailed"), variant: "destructive" });
  }, [status.storageFailed]);

  const dataLostRef = useRef(0);
  useEffect(() => {
    if (status.dataLostCount <= dataLostRef.current) return;
    dataLostRef.current = status.dataLostCount;
    toast({ title: tNow("sync.dataLost"), variant: "destructive" });
  }, [status.dataLostCount]);

  const refreshConfusables = useCallback(
    async (focus?: { word: string; senses: WordSense[] }): Promise<number> => {
      const inputs = new Map<string, WordSense[]>();
      for (const word of words.knownWords()) {
        const senses = decodeSenses(words.getTranslation(word) ?? "");
        if (senses.length > 0) inputs.set(word, senses);
      }
      if (focus && focus.senses.length > 0) {
        inputs.set(focus.word, focus.senses);
      }
      if (inputs.size < 2) return 0;

      const list = Array.from(inputs, ([word, senses]) => ({ word, senses }));
      const { results } = await postJson<{ results?: ConfusableResult[] }>(
        "/api/confusables",
        { words: list, ...(focus ? { focus: focus.word } : {}) },
        tNow("error.updateConfusablesFailed"),
      );

      const updates = results ?? [];
      await ledger.updateConfusables(updates);
      return updates.length;
    },
    [ledger],
  );

  const value = useMemo<WordsContextValue>(
    () => ({
      words,
      addWord: ledger.addWord,
      deleteWord: ledger.deleteWord,
      recordReview: ledger.recordReview,
      syncToFirestore: ledger.sync,
      resetPracticeRecords: ledger.resetPracticeRecords,
      updateTranslations: ledger.updateTranslations,
      refreshConfusables,
      normalizeWordForms: ledger.normalizeWordForms,
      loading: status.loading,
      error: status.error,
    }),
    [ledger, refreshConfusables, status.loading, status.error],
  );

  const syncStatus = useMemo<SyncStatusValue>(
    () => ({ syncing: status.syncing, pendingCount: status.pendingCount }),
    [status.syncing, status.pendingCount],
  );

  return (
    <WordsContext.Provider value={value}>
      <SyncStatusContext.Provider value={syncStatus}>
        <WordsRepoContext.Provider value={repo}>{children}</WordsRepoContext.Provider>
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

export const useWordsRepo = (): WordsRepo | null => useContext(WordsRepoContext);
