import type { SyncQueueItem } from "@/lib/syncQueue";
import { isQueueItemStale, type WordData } from "@/lib/wordsStore";

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

export const buildAttemptQueueData = (
  data: WordData
): SyncQueueItem["data"] => ({
  correctCount: data.correctCount,
  totalAttempts: data.totalAttempts,
  inputTimes: data.inputTimes,
  correctPracticeDates: data.correctPracticeDates,
  attemptHistory: data.attemptHistory,
});

export const buildAttemptUpdateFields = (
  data: SyncQueueItem["data"],
  lastPracticedAt: number
) => ({
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

export const collectStaleQueueItemIds = (
  firestoreWords: Map<string, WordData>,
  queue: SyncQueueItem[]
): string[] => {
  const staleIds: string[] = [];
  queue.forEach((item) => {
    const firestoreWord = firestoreWords.get(item.wordId);
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
