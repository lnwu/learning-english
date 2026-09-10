import type { SyncQueueItem } from "@/lib/syncQueue";
import type { WordData } from "@/lib/wordsStore";

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
