"use client";

import {
  useMemo,
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
import {
  createLocalStorageQueueStorage,
  createNoopQueueStorage,
} from "@/lib/queueStorage";
import { tNow } from "@/lib/i18n";
import { toast } from "@/hooks/useToast";

const words = new Words();
const SYNC_INTERVAL_MS = 30 * 1000;

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
  const ledger = useMemo(
    () =>
      new WordsLedger({
        words,
        repo,
        queue: repo
          ? createLocalStorageQueueStorage(repo.userId)
          : createNoopQueueStorage(),
      }),
    [repo]
  );

  const status = useSyncExternalStore(
    ledger.subscribe,
    ledger.getStatus,
    ledger.getServerStatus
  );

  useEffect(() => ledger.start(), [ledger]);

  useEffect(() => {
    if (!repo) return;

    void ledger.sync();
    const timer = setInterval(() => {
      void ledger.sync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [repo, ledger]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void ledger.sync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [ledger]);

  useEffect(() => {
    const handleOnline = () => {
      void ledger.sync();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [ledger]);

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

  const value = useMemo<WordsContextValue>(
    () => ({
      words,
      addWord: ledger.addWord,
      deleteWord: ledger.deleteWord,
      recordCorrectAttempt: ledger.recordCorrectAttempt,
      recordIncorrectAttempt: ledger.recordIncorrectAttempt,
      syncToFirestore: ledger.sync,
      resetPracticeRecords: ledger.resetPracticeRecords,
      updateTranslations: ledger.updateTranslations,
      normalizeWordForms: ledger.normalizeWordForms,
      loading: status.loading,
      error: status.error,
    }),
    [ledger, status.loading, status.error]
  );

  const syncStatus = useMemo<SyncStatusValue>(
    () => ({ syncing: status.syncing, pendingCount: status.pendingCount }),
    [status.syncing, status.pendingCount]
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
