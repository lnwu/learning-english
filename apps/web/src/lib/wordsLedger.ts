import { tNow } from "@/lib/i18n";
import { mergeSnapshotIntoStore, type Words } from "@/lib/wordsStore";
import { buildWordUpdates, collectStaleQueueItemIds, runWordSync } from "@/lib/wordSync";
import {
  attemptUpdateFields,
  practiceFields,
  resetPracticeFields,
  translationFields,
} from "@/lib/wordDoc";
import type { WordsRepo } from "@/lib/wordsRepo";
import type { WordSense } from "@/lib/wordSenses";
import type { Rating } from "@/lib/masteryModel";
import type { NewQueueItem, QueueStorage, SyncQueueItem } from "@/lib/queueStorage";
import { buildNormalizeDocPlan } from "@/lib/wordNormalization";

const MAX_SYNC_RETRIES = 3;

export interface WordsLedgerStatus {
  loading: boolean;
  error: string | null;
  syncing: boolean;
  pendingCount: number;
  storageFailed: boolean;
  dataLostCount: number;
}

const INITIAL_WORDS_LEDGER_STATUS: WordsLedgerStatus = Object.freeze({
  loading: true,
  error: null,
  syncing: false,
  pendingCount: 0,
  storageFailed: false,
  dataLostCount: 0,
});

export interface WordsLedgerDeps {
  words: Words;
  repo: WordsRepo | null;
  queue: QueueStorage;
}

type StatusListener = () => void;

const isSameStatus = (a: WordsLedgerStatus, b: WordsLedgerStatus): boolean =>
  a.loading === b.loading &&
  a.error === b.error &&
  a.syncing === b.syncing &&
  a.pendingCount === b.pendingCount &&
  a.storageFailed === b.storageFailed &&
  a.dataLostCount === b.dataLostCount;

export class WordsLedger {
  #words: Words;
  #repo: WordsRepo | null;
  #queue: QueueStorage;
  #status: WordsLedgerStatus = { ...INITIAL_WORDS_LEDGER_STATUS };
  #listeners = new Set<StatusListener>();
  #syncing = false;
  #wordsLoaded = false;

  constructor(deps: WordsLedgerDeps) {
    this.#words = deps.words;
    this.#repo = deps.repo;
    this.#queue = deps.queue;
  }

  getServerStatus = (): WordsLedgerStatus => INITIAL_WORDS_LEDGER_STATUS;

  getStatus = (): WordsLedgerStatus => this.#status;

  subscribe = (listener: StatusListener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #setStatus(patch: Partial<WordsLedgerStatus>): void {
    const next = { ...this.#status, ...patch };
    if (isSameStatus(next, this.#status)) return;
    this.#status = next;
    this.#listeners.forEach((listener) => listener());
  }

  #pendingCount(): number {
    return new Set(this.#queue.load().map((item) => item.word)).size;
  }

  #addToQueue(item: NewQueueItem): void {
    const queued: SyncQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const existing = this.#queue.get(queued.wordId);
    if (
      existing &&
      (existing.data.memory.lastReviewAt ?? 0) > (queued.data.memory.lastReviewAt ?? 0)
    ) {
      return;
    }
    this.#queue.save(queued);
  }

  #notifyIfStorageFallback(): void {
    if (!this.#queue.usingMemoryFallback) return;
    this.#setStatus({ storageFailed: true });
  }

  #incrementRetries(ids: string[]): string[] {
    if (ids.length === 0) return [];
    const idSet = new Set(ids);
    const discardedIds: string[] = [];

    for (const item of this.#queue.load()) {
      if (!idSet.has(item.id)) continue;
      const retryCount = item.retryCount + 1;
      if (retryCount >= MAX_SYNC_RETRIES) {
        this.#queue.removeByIds([item.id]);
        discardedIds.push(item.id);
        continue;
      }
      this.#queue.save({ ...item, retryCount });
    }

    return discardedIds;
  }

  #enqueueAttempt(word: string): void {
    const wordId = this.#words.getWordId(word);
    const data = this.#words.getWordData(word);
    if (!wordId || !data) return;

    this.#addToQueue({
      type: "attempt",
      word,
      wordId,
      data: practiceFields(data),
    });
    this.#notifyIfStorageFallback();
    this.#setStatus({ pendingCount: this.#pendingCount() });
  }

  start = (): (() => void) => {
    const repo = this.#repo;
    if (!repo) {
      this.#words.removeAllWords();
      this.#words.clearUserInputs();
      this.#wordsLoaded = false;
      this.#setStatus({ loading: false, error: null, pendingCount: 0 });
      return () => {};
    }

    this.#wordsLoaded = false;
    this.#setStatus({
      loading: true,
      error: null,
      pendingCount: this.#pendingCount(),
    });

    try {
      return repo.subscribeWords({
        onDocs: (docs) => {
          const queue = this.#queue.load();
          const merged = mergeSnapshotIntoStore(
            this.#words,
            { docs },
            queue.map((item) => ({
              wordId: item.wordId,
              data: item.data,
            })),
          );

          const staleIds = collectStaleQueueItemIds(merged, queue);
          if (staleIds.length > 0) {
            this.#queue.removeByIds(staleIds);
          }

          this.#wordsLoaded = true;
          this.#setStatus({
            loading: false,
            error: null,
            pendingCount: this.#pendingCount(),
          });
        },
        onError: (error) => {
          console.error("Firestore error:", error);
          this.#setStatus({
            error: tNow("error.loadWordsFailed"),
            loading: false,
          });
        },
      });
    } catch (error) {
      console.error("Firebase Auth error:", error);
      this.#setStatus({ error: tNow("error.authFailed"), loading: false });
      return () => {};
    }
  };

  recordReview = (
    word: string,
    rating: Rating,
    options: { hint?: boolean; inputTimeSeconds?: number } = {},
  ): void => {
    this.#words.recordReview(word, rating, options);
    this.#enqueueAttempt(word);
  };

  sync = async (): Promise<void> => {
    const repo = this.#repo;
    if (!repo) {
      console.warn("User not authenticated, skipping sync");
      return;
    }

    if (this.#syncing) return;

    const queue = this.#queue.load();
    if (queue.length === 0) return;

    this.#syncing = true;
    this.#setStatus({ syncing: true });

    try {
      const updates = buildWordUpdates(queue);
      const result = await runWordSync({
        entries: Array.from(updates.entries()),
        chunkSize: repo.batchLimit,
        isWordsLoaded: () => this.#wordsLoaded,
        wordExists: (word) => this.#words.hasWord(word),
        writeChunk: async (chunk) => {
          await repo.commitWordOperations(
            chunk.map(([wordId, { data }]) => ({
              type: "update" as const,
              wordId,
              fields: attemptUpdateFields(data),
            })),
          );
        },
        queue: {
          remove: (ids) => this.#queue.removeByIds(ids),
          incrementRetries: (ids) => this.#incrementRetries(ids),
        },
      });

      const patch: Partial<WordsLedgerStatus> = {
        pendingCount: this.#pendingCount(),
      };
      if (result.discarded.length > 0) {
        patch.dataLostCount = this.#status.dataLostCount + 1;
      }
      this.#setStatus(patch);
    } catch (error) {
      console.error("Sync failed:", error);
      this.#setStatus({ pendingCount: this.#pendingCount() });
    } finally {
      this.#syncing = false;
      this.#setStatus({ syncing: false });
    }
  };

  addWord = async (word: string, senses: WordSense[]): Promise<void> => {
    const repo = this.#repo;
    if (!repo) {
      throw new Error(tNow("error.notAuthenticated"));
    }

    try {
      await repo.addWord(word, senses);
    } catch (error) {
      console.error("Failed to add word:", error);
      throw new Error(`${tNow("addWord.addFailed")}${error}`);
    }
  };

  deleteWord = async (word: string): Promise<void> => {
    const repo = this.#repo;
    if (!repo) {
      throw new Error(tNow("error.notAuthenticated"));
    }

    const wordId = this.#words.getWordId(word);
    if (!wordId) {
      throw new Error(tNow("error.wordNotFound"));
    }

    try {
      await repo.deleteWord(wordId);

      const removedIds = this.#queue
        .load()
        .filter((item) => item.wordId === wordId)
        .map((item) => item.id);
      if (removedIds.length > 0) {
        this.#queue.removeByIds(removedIds);
        this.#setStatus({ pendingCount: this.#pendingCount() });
      }
    } catch (error) {
      console.error("Failed to delete word:", error);
      throw new Error(tNow("error.deleteWordFailed"));
    }
  };

  updateTranslations = async (
    updates: Array<{ word: string; senses: WordSense[] }>,
  ): Promise<void> => {
    const repo = this.#repo;
    if (!repo) {
      throw new Error(tNow("error.notAuthenticated"));
    }

    if (updates.length === 0) return;

    const entries = updates
      .map(({ word, senses }) => {
        const data = this.#words.getWordData(word);
        const wordId = data?.id;
        if (!data || !wordId) return null;
        return { word, senses, data, wordId, fields: translationFields(senses) };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (entries.length === 0) return;

    try {
      entries.forEach(({ word, data, fields }) => {
        this.#words.setWordData(word, { ...data, translation: fields.translation });
      });

      await repo.commitWordOperations(
        entries.map(({ wordId, fields }) => ({
          type: "update" as const,
          wordId,
          fields,
        })),
      );
    } catch (error) {
      console.error("Failed to update translations:", error);
      throw new Error(tNow("error.updateTranslationFailed"));
    }
  };

  normalizeWordForms = async (
    renames: Array<{ from: string; to: string }>,
  ): Promise<{ renamed: number; merged: number }> => {
    const repo = this.#repo;
    if (!repo) {
      throw new Error(tNow("error.notAuthenticated"));
    }

    const plan = renames.filter(({ from, to }) => from !== to && this.#words.hasWord(from));
    if (plan.length === 0) return { renamed: 0, merged: 0 };

    try {
      await this.sync();

      const docPlan = buildNormalizeDocPlan(plan, (word) => this.#words.getWordData(word));

      if (docPlan.operations.length > 0) {
        await repo.commitWordOperations(docPlan.operations);
      }

      docPlan.storeUpdates.forEach(({ from, to, data }) => {
        this.#words.moveWord(from, to, data);
      });

      return { renamed: docPlan.renamed, merged: docPlan.merged };
    } catch (error) {
      console.error("Failed to normalize word forms:", error);
      throw new Error(tNow("error.normalizeWordFailed"));
    }
  };

  resetPracticeRecords = async (): Promise<void> => {
    const repo = this.#repo;
    if (!repo) {
      throw new Error(tNow("error.notAuthenticated"));
    }

    try {
      const resetDocs = this.#words.resetPracticeRecords();

      await repo.commitWordOperations(
        resetDocs.map((data) => ({
          type: "update" as const,
          wordId: data.id,
          fields: resetPracticeFields(Date.now()),
        })),
      );

      this.#queue.clear();
      this.#setStatus({ pendingCount: this.#pendingCount() });
    } catch (error) {
      console.error("Failed to reset practice records:", error);
      throw new Error(tNow("error.resetFailed"));
    }
  };
}
