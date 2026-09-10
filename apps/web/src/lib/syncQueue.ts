// 同步队列项类型
export interface SyncQueueItem {
  id: string;
  type: 'attempt';
  word: string;
  wordId: string;
  data: {
    correctCount: number;
    totalAttempts: number;
    inputTimes: number[];
    correctPracticeDates?: string[];
    attemptHistory?: boolean[];
  };
  timestamp: number;
  retryCount: number;
}

const STORAGE_KEY_PREFIX = 'sync_queue';
const MAX_RETRIES = 3;

// 同步队列管理器
export class SyncQueueManager {
  private static currentUserId: string | null = null;
  private static memoryQueue: SyncQueueItem[] | null = null;

  static setUser(userId: string | null): void {
    if (SyncQueueManager.currentUserId === userId) return;
    SyncQueueManager.currentUserId = userId;
    SyncQueueManager.memoryQueue = null;

    if (userId) {
      SyncQueueManager.migrateLegacyQueue();
    }
  }

  private static get itemKeyPrefix(): string | null {
    return SyncQueueManager.currentUserId
      ? `${STORAGE_KEY_PREFIX}:${SyncQueueManager.currentUserId}:`
      : null;
  }

  private static get legacyUserKey(): string | null {
    return SyncQueueManager.currentUserId
      ? `${STORAGE_KEY_PREFIX}:${SyncQueueManager.currentUserId}`
      : null;
  }

  private static parseItem(raw: string | null): SyncQueueItem | null {
    if (!raw) return null;
    try {
      const item = JSON.parse(raw) as SyncQueueItem;
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.wordId !== 'string' ||
        !item.data ||
        typeof item.data.totalAttempts !== 'number'
      ) {
        return null;
      }
      return item;
    } catch {
      return null;
    }
  }

  private static migrateLegacyQueue(): void {
    const prefix = SyncQueueManager.itemKeyPrefix;
    const userKey = SyncQueueManager.legacyUserKey;
    if (!prefix || !userKey) return;

    try {
      const legacyContents = [
        localStorage.getItem(STORAGE_KEY_PREFIX),
        localStorage.getItem(userKey),
      ];
      let migrationFailed = false;

      for (const raw of legacyContents) {
        if (!raw) continue;
        try {
          const items = JSON.parse(raw) as SyncQueueItem[];
          if (!Array.isArray(items)) continue;
          items.forEach((item) => {
            if (!item || typeof item.wordId !== 'string') return;
            try {
              localStorage.setItem(
                `${prefix}${item.wordId}`,
                JSON.stringify(item)
              );
            } catch (error) {
              migrationFailed = true;
              console.error('Failed to migrate sync queue item:', error);
            }
          });
        } catch {
          continue;
        }
      }

      if (!migrationFailed) {
        localStorage.removeItem(STORAGE_KEY_PREFIX);
        localStorage.removeItem(userKey);
      }
    } catch (error) {
      console.error('Failed to migrate legacy sync queue:', error);
    }
  }

  static hasMemoryFallback(): boolean {
    return SyncQueueManager.memoryQueue !== null;
  }

  private static readItems(): SyncQueueItem[] {
    if (SyncQueueManager.memoryQueue) {
      return [...SyncQueueManager.memoryQueue];
    }

    const prefix = SyncQueueManager.itemKeyPrefix;
    if (!prefix) return [];

    const items: SyncQueueItem[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const item = SyncQueueManager.parseItem(localStorage.getItem(key));
        if (item) items.push(item);
      }
    } catch (error) {
      console.error('Failed to read sync queue:', error);
      return [];
    }

    return items.sort((a, b) => a.timestamp - b.timestamp);
  }

  private static collectItemKeys(idSet: Set<string>): string[] {
    const prefix = SyncQueueManager.itemKeyPrefix;
    if (!prefix) return [];

    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const item = SyncQueueManager.parseItem(localStorage.getItem(key));
      if (item && idSet.has(item.id)) keys.push(key);
    }
    return keys;
  }

  // 获取队列
  static getQueue(): SyncQueueItem[] {
    return SyncQueueManager.readItems();
  }

  // 添加到队列（同一 wordId 只保留最新一条；已有条目的尝试次数更多时不回退覆盖）
  static addToQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): void {
    const newItem: SyncQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      retryCount: 0,
    };

    if (SyncQueueManager.memoryQueue) {
      SyncQueueManager.memoryQueue = [
        ...SyncQueueManager.memoryQueue.filter(
          (entry) => entry.wordId !== newItem.wordId
        ),
        newItem,
      ];
      return;
    }

    const prefix = SyncQueueManager.itemKeyPrefix;
    if (!prefix) return;

    const key = `${prefix}${newItem.wordId}`;
    try {
      const existing = SyncQueueManager.parseItem(localStorage.getItem(key));
      if (
        existing &&
        existing.data.totalAttempts > newItem.data.totalAttempts
      ) {
        return;
      }
      localStorage.setItem(key, JSON.stringify(newItem));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
      SyncQueueManager.memoryQueue = [
        ...SyncQueueManager.readItems().filter(
          (entry) => entry.wordId !== newItem.wordId
        ),
        newItem,
      ];
    }
  }

  // 从队列移除
  static removeFromQueue(ids: string[]): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);

    if (SyncQueueManager.memoryQueue) {
      SyncQueueManager.memoryQueue = SyncQueueManager.memoryQueue.filter(
        (item) => !idSet.has(item.id)
      );
      return;
    }

    try {
      SyncQueueManager.collectItemKeys(idSet).forEach((key) =>
        localStorage.removeItem(key)
      );
    } catch (error) {
      console.error('Failed to remove sync queue items:', error);
    }
  }

  // 更新重试次数（达到最大重试次数的自动移除），返回被丢弃的条目
  static incrementRetries(ids: string[]): SyncQueueItem[] {
    const discarded: SyncQueueItem[] = [];
    if (ids.length === 0) return discarded;
    const idSet = new Set(ids);

    if (SyncQueueManager.memoryQueue) {
      const remaining: SyncQueueItem[] = [];
      for (const item of SyncQueueManager.memoryQueue) {
        if (!idSet.has(item.id)) {
          remaining.push(item);
          continue;
        }
        item.retryCount += 1;
        if (item.retryCount >= MAX_RETRIES) {
          discarded.push(item);
          continue;
        }
        remaining.push(item);
      }
      SyncQueueManager.memoryQueue = remaining;
      return discarded;
    }

    const prefix = SyncQueueManager.itemKeyPrefix;
    if (!prefix) return discarded;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const item = SyncQueueManager.parseItem(localStorage.getItem(key));
        if (!item || !idSet.has(item.id)) continue;
        item.retryCount += 1;
        if (item.retryCount >= MAX_RETRIES) {
          discarded.push(item);
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(item));
        }
      }
    } catch (error) {
      console.error('Failed to update sync queue retries:', error);
    }
    return discarded;
  }

  // 清空队列
  static clearQueue(): void {
    SyncQueueManager.memoryQueue = null;
    const prefix = SyncQueueManager.itemKeyPrefix;
    const userKey = SyncQueueManager.legacyUserKey;
    if (!prefix) return;

    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
      if (userKey) localStorage.removeItem(userKey);
    } catch (error) {
      console.error('Failed to clear sync queue:', error);
    }
  }

  // 获取待同步的唯一单词数量
  static getUniqueWordCount(): number {
    const uniqueWords = new Set(
      SyncQueueManager.readItems().map((item) => item.word)
    );
    return uniqueWords.size;
  }
}
