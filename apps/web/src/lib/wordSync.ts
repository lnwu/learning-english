import type { SyncQueueItem } from "@/lib/syncQueue";
import {
  isQueueItemStale,
  type MergedSnapshotResult,
} from "@/lib/wordsStore";
import { commitInChunks } from "@/lib/chunkedCommit";

export interface WordSyncUpdate {
  word: string;
  data: SyncQueueItem["data"];
  lastPracticedAt: number;
  queueItemIds: string[];
}

export const buildWordUpdates = (
  queue: SyncQueueItem[]
): Map<string, WordSyncUpdate> => {
  const updates = new Map<string, WordSyncUpdate>();

  queue.forEach((item) => {
    const existing = updates.get(item.wordId);
    if (existing) {
      existing.data = item.data;
      existing.lastPracticedAt = item.timestamp;
      existing.queueItemIds.push(item.id);
    } else {
      updates.set(item.wordId, {
        word: item.word,
        data: item.data,
        lastPracticedAt: item.timestamp,
        queueItemIds: [item.id],
      });
    }
  });

  return updates;
};

export const collectStaleQueueItemIds = (
  snapshot: MergedSnapshotResult,
  queue: SyncQueueItem[]
): string[] => {
  const staleIds: string[] = [];
  queue.forEach((item) => {
    const firestoreWord = snapshot.byId.get(item.wordId);
    if (firestoreWord && isQueueItemStale(firestoreWord, item.data)) {
      staleIds.push(item.id);
    }
  });
  return staleIds;
};

export const classifySyncBatchFailure = (input: {
  errorCode: string | undefined;
  wordsLoaded: boolean;
  updates: Array<{ word: string; queueItemIds: string[] }>;
  wordExists: (word: string) => boolean;
}): { goneQueueItemIds: string[]; retryQueueItemIds: string[] } => {
  const wordWasDeleted =
    input.errorCode === "not-found" && input.wordsLoaded;
  const goneQueueItemIds: string[] = [];
  const retryQueueItemIds: string[] = [];

  for (const update of input.updates) {
    if (wordWasDeleted && !input.wordExists(update.word)) {
      goneQueueItemIds.push(...update.queueItemIds);
    } else {
      retryQueueItemIds.push(...update.queueItemIds);
    }
  }

  return { goneQueueItemIds, retryQueueItemIds };
};

export interface WordSyncQueuePort {
  remove: (ids: string[]) => void;
  incrementRetries: (ids: string[]) => string[];
}

export interface WordSyncResult {
  committed: string[];
  gone: string[];
  retried: string[];
  discarded: string[];
}

export interface RunWordSyncInput {
  entries: Array<[string, WordSyncUpdate]>;
  chunkSize: number;
  isWordsLoaded: () => boolean;
  wordExists: (word: string) => boolean;
  writeChunk: (chunk: Array<[string, WordSyncUpdate]>) => Promise<void>;
  queue: WordSyncQueuePort;
}

export const runWordSync = async (
  input: RunWordSyncInput
): Promise<WordSyncResult> => {
  const result: WordSyncResult = {
    committed: [],
    gone: [],
    retried: [],
    discarded: [],
  };

  await commitInChunks({
    items: input.entries,
    chunkSize: input.chunkSize,
    commitChunk: input.writeChunk,
    onChunkCommitted: (chunk) => {
      const ids = chunk.flatMap(([, update]) => update.queueItemIds);
      input.queue.remove(ids);
      result.committed.push(...ids);
    },
    onChunkFailed: (chunk, error) => {
      console.error("Failed to sync batch:", error);

      const { goneQueueItemIds, retryQueueItemIds } =
        classifySyncBatchFailure({
          errorCode: (error as { code?: string }).code,
          wordsLoaded: input.isWordsLoaded(),
          updates: chunk.map(([, update]) => ({
            word: update.word,
            queueItemIds: update.queueItemIds,
          })),
          wordExists: input.wordExists,
        });

      if (goneQueueItemIds.length > 0) {
        input.queue.remove(goneQueueItemIds);
        result.gone.push(...goneQueueItemIds);
      }

      const discardedIds = input.queue.incrementRetries(retryQueueItemIds);
      const discardedSet = new Set(discardedIds);
      result.discarded.push(...discardedIds);
      result.retried.push(
        ...retryQueueItemIds.filter((id) => !discardedSet.has(id))
      );
    },
  });

  return result;
};
