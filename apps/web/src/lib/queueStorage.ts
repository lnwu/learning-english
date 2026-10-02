import type { SyncableWordData } from "@/lib/wordsStore";

export interface SyncQueueItem {
  id: string;
  type: "attempt";
  word: string;
  wordId: string;
  data: SyncableWordData;
  timestamp: number;
  retryCount: number;
}

export type NewQueueItem = Omit<SyncQueueItem, "id" | "timestamp" | "retryCount">;

export interface QueueStorage {
  load(): SyncQueueItem[];
  get(wordId: string): SyncQueueItem | null;
  save(item: SyncQueueItem): void;
  removeByIds(ids: string[]): void;
  clear(): void;
  readonly usingMemoryFallback: boolean;
}

const STORAGE_KEY_PREFIX = "sync_queue";

const parseItem = (raw: string | null): SyncQueueItem | null => {
  if (!raw) return null;
  try {
    const item = JSON.parse(raw) as SyncQueueItem;
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.wordId !== "string" ||
      !item.data ||
      !item.data.memory ||
      !item.data.stats ||
      !Array.isArray(item.data.inputTimes) ||
      !Array.isArray(item.data.reviews)
    ) {
      return null;
    }
    return item;
  } catch {
    return null;
  }
};

export const createMemoryQueueStorage = (): QueueStorage => {
  let items: SyncQueueItem[] = [];

  return {
    load: () => [...items],
    get: (wordId) => items.find((item) => item.wordId === wordId) ?? null,
    save: (item) => {
      items = [...items.filter((entry) => entry.wordId !== item.wordId), item];
    },
    removeByIds: (ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      items = items.filter((item) => !idSet.has(item.id));
    },
    clear: () => {
      items = [];
    },
    usingMemoryFallback: false,
  };
};

export const createNoopQueueStorage = (): QueueStorage => ({
  load: () => [],
  get: () => null,
  save: () => {},
  removeByIds: () => {},
  clear: () => {},
  usingMemoryFallback: false,
});

export const createLocalStorageQueueStorage = (userId: string): QueueStorage => {
  const itemKeyPrefix = `${STORAGE_KEY_PREFIX}:${userId}:`;
  let memoryItems: SyncQueueItem[] | null = null;

  const readAll = (): SyncQueueItem[] => {
    const items: SyncQueueItem[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(itemKeyPrefix)) continue;
        const item = parseItem(localStorage.getItem(key));
        if (item) items.push(item);
      }
    } catch (error) {
      console.error("Failed to read sync queue:", error);
      return [];
    }
    return items.sort((a, b) => a.timestamp - b.timestamp);
  };

  const collectItemKeys = (idSet: Set<string>): string[] => {
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(itemKeyPrefix)) continue;
        const item = parseItem(localStorage.getItem(key));
        if (item && idSet.has(item.id)) keys.push(key);
      }
    } catch (error) {
      console.error("Failed to collect sync queue keys:", error);
    }
    return keys;
  };

  return {
    get usingMemoryFallback() {
      return memoryItems !== null;
    },

    load() {
      return memoryItems ? [...memoryItems] : readAll();
    },

    get(wordId) {
      if (memoryItems) {
        return memoryItems.find((item) => item.wordId === wordId) ?? null;
      }
      try {
        return parseItem(localStorage.getItem(`${itemKeyPrefix}${wordId}`));
      } catch (error) {
        console.error("Failed to read sync queue item:", error);
        return null;
      }
    },

    save(item) {
      if (memoryItems) {
        memoryItems = [...memoryItems.filter((entry) => entry.wordId !== item.wordId), item];
        return;
      }
      try {
        localStorage.setItem(`${itemKeyPrefix}${item.wordId}`, JSON.stringify(item));
      } catch (error) {
        console.error("Failed to save sync queue:", error);
        memoryItems = [...readAll().filter((entry) => entry.wordId !== item.wordId), item];
      }
    },

    removeByIds(ids) {
      if (ids.length === 0) return;
      const idSet = new Set(ids);

      if (memoryItems) {
        memoryItems = memoryItems.filter((item) => !idSet.has(item.id));
        return;
      }
      try {
        collectItemKeys(idSet).forEach((key) => localStorage.removeItem(key));
      } catch (error) {
        console.error("Failed to remove sync queue items:", error);
      }
    },

    clear() {
      memoryItems = null;
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(itemKeyPrefix)) keys.push(key);
        }
        keys.forEach((key) => localStorage.removeItem(key));
      } catch (error) {
        console.error("Failed to clear sync queue:", error);
      }
    },
  };
};
