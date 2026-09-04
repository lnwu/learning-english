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

const LEGACY_STORAGE_KEY = 'sync_queue';

// 同步队列管理器
export class SyncQueueManager {
  private static MAX_RETRIES = 3;
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

  private static migrateLegacyQueue(): void {
    const key = SyncQueueManager.storageKey;
    if (!key) return;
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && !localStorage.getItem(key)) {
        localStorage.setItem(key, legacy);
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to migrate legacy sync queue:', error);
    }
  }

  private static get storageKey(): string | null {
    return SyncQueueManager.currentUserId
      ? `${LEGACY_STORAGE_KEY}:${SyncQueueManager.currentUserId}`
      : null;
  }

  static hasMemoryFallback(): boolean {
    return SyncQueueManager.memoryQueue !== null;
  }

  // 获取队列
  static getQueue(): SyncQueueItem[] {
    if (SyncQueueManager.memoryQueue) {
      return [...SyncQueueManager.memoryQueue];
    }
    const key = SyncQueueManager.storageKey;
    if (!key) return [];
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to read sync queue:', error);
      return [];
    }
  }

  // 保存队列
  static saveQueue(queue: SyncQueueItem[]): void {
    if (SyncQueueManager.memoryQueue) {
      SyncQueueManager.memoryQueue = [...queue];
      return;
    }
    const key = SyncQueueManager.storageKey;
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
      SyncQueueManager.memoryQueue = [...queue];
    }
  }

  // 添加到队列
  static addToQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): void {
    const queue = this.getQueue();
    const newItem: SyncQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      retryCount: 0,
    };
    queue.push(newItem);
    this.saveQueue(queue);
  }

  // 从队列移除
  static removeFromQueue(ids: string[]): void {
    if (ids.length === 0) return;
    const queue = this.getQueue();
    const idSet = new Set(ids);
    const filtered = queue.filter(item => !idSet.has(item.id));
    if (filtered.length !== queue.length) {
      this.saveQueue(filtered);
    }
  }

  // 更新重试次数（达到最大重试次数的自动移除），返回被丢弃的条目
  static incrementRetries(ids: string[]): SyncQueueItem[] {
    const discarded: SyncQueueItem[] = [];
    if (ids.length === 0) return discarded;
    const queue = this.getQueue();
    const idSet = new Set(ids);
    const remaining: SyncQueueItem[] = [];
    for (const item of queue) {
      if (idSet.has(item.id)) {
        item.retryCount++;
        if (item.retryCount >= this.MAX_RETRIES) {
          discarded.push(item);
          continue;
        }
      }
      remaining.push(item);
    }
    this.saveQueue(remaining);
    return discarded;
  }

  // 清空队列
  static clearQueue(): void {
    SyncQueueManager.memoryQueue = null;
    const key = SyncQueueManager.storageKey;
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to clear sync queue:', error);
    }
  }

  // 获取队列长度
  static getQueueLength(): number {
    return this.getQueue().length;
  }

  // 获取待同步的唯一单词数量
  static getUniqueWordCount(): number {
    const queue = this.getQueue();
    const uniqueWords = new Set(queue.map(item => item.word));
    return uniqueWords.size;
  }
}
