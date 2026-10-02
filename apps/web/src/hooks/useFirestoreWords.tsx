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
import { countFailedWords, runAiBatches } from "@/lib/batchAiTask";
import type { ConfusableSenses } from "@/lib/confusables";
import type { Rating } from "@/lib/masteryModel";

const words = new Words();
const SYNC_INTERVAL_MS = 30 * 1000;

export interface ConfusablesRefreshResult {
  updated: number;
  failed: number;
}

interface RefreshConfusablesOptions {
  focus?: { word: string; senses: WordSense[] };
  onProgress?: (completed: number) => void;
}

const withoutNotes = (senses: WordSense[]): WordSense[] =>
  senses.map(({ pos, chinese, english }) => ({ pos, chinese, english }));

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
  refreshConfusables: (options?: RefreshConfusablesOptions) => Promise<ConfusablesRefreshResult>;
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
    async (options?: RefreshConfusablesOptions): Promise<ConfusablesRefreshResult> => {
      const inputs = new Map<string, WordSense[]>();
      for (const word of words.knownWords()) {
        const senses = decodeSenses(words.getTranslation(word) ?? "");
        if (senses.length > 0) inputs.set(word, senses);
      }
      const focus = options?.focus;
      if (focus && focus.senses.length > 0) {
        inputs.set(focus.word, focus.senses);
      }
      if (inputs.size < 2) return { updated: 0, failed: 0 };

      const list = Array.from(inputs, ([word, senses]) => ({ word, senses }));
      const sensesOf = new Map(list.map((item) => [item.word, item.senses]));

      const { groups: detected } = await postJson<{ groups?: string[][] }>(
        "/api/confusables/groups",
        { words: list },
        tNow("error.updateConfusablesFailed"),
      );
      const groups = (detected ?? []).filter((group) => !focus || group.includes(focus.word));

      const outcomes = await runAiBatches<ConfusableSenses[]>({
        batches: groups,
        onProgress: options?.onProgress,
        runBatch: (group) =>
          postJson<{ results?: ConfusableSenses[] }>(
            "/api/confusables",
            { words: group.map((word) => ({ word, senses: sensesOf.get(word) ?? [] })) },
            tNow("error.updateConfusablesFailed"),
          ).then((data) => data.results ?? []),
      });

      let updated = 0;
      const updates: Array<{ word: string; senses: WordSense[]; confusables: string[] }> = [];
      for (const outcome of outcomes) {
        if ("error" in outcome) {
          console.error("Confusable group failed:", outcome.error);
        }
        const rewritten =
          "error" in outcome
            ? new Map<string, WordSense[]>()
            : new Map(outcome.result.map((item) => [item.word, item.senses]));
        for (const word of outcome.words) {
          const senses = rewritten.get(word);
          if (senses) updated += 1;
          updates.push({
            word,
            senses: senses ?? withoutNotes(sensesOf.get(word) ?? []),
            confusables: outcome.words.filter((other) => other !== word),
          });
        }
      }

      const groupWords = new Set(groups.flat());
      const cleared = focus
        ? []
        : list
            .filter(
              ({ word, senses }) =>
                !groupWords.has(word) &&
                (words.getConfusables(word).length > 0 || senses.some((sense) => sense.note)),
            )
            .map(({ word, senses }) => ({
              word,
              senses: withoutNotes(senses),
              confusables: [],
            }));

      await ledger.updateConfusables([...updates, ...cleared]);
      options?.onProgress?.(list.length);
      return { updated, failed: countFailedWords(outcomes) };
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
