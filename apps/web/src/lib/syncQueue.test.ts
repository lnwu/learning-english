import { describe, it, expect, beforeEach } from "bun:test";
import { SyncQueueManager, type SyncQueueItem } from "./syncQueue";

class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

const localStorageMock = new LocalStorageMock();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

function makeItem(word: string): SyncQueueItem {
  SyncQueueManager.addToQueue({
    type: "attempt",
    word,
    wordId: `id-${word}`,
    data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
  });
  const queue = SyncQueueManager.getQueue();
  return queue[queue.length - 1];
}

describe("SyncQueueManager", () => {
  beforeEach(() => {
    localStorageMock.clear();
    SyncQueueManager.clearQueue();
    SyncQueueManager.setUser("user-1");
  });

  it("addToQueue 追加条目并补全 id/timestamp/retryCount", () => {
    const item = makeItem("apple");
    expect(item.word).toBe("apple");
    expect(item.retryCount).toBe(0);
    expect(item.id).toBeTruthy();
    expect(SyncQueueManager.getQueue()).toHaveLength(1);
  });

  it("队列按 uid 隔离存储", () => {
    makeItem("apple");
    expect(localStorageMock.getItem("sync_queue:user-1")).toBeTruthy();

    SyncQueueManager.setUser("user-2");
    expect(SyncQueueManager.getQueue()).toHaveLength(0);

    makeItem("banana");
    SyncQueueManager.setUser("user-1");
    expect(SyncQueueManager.getQueue().map((item) => item.word)).toEqual([
      "apple",
    ]);
  });

  it("未登录时队列操作为 no-op", () => {
    SyncQueueManager.setUser(null);
    SyncQueueManager.addToQueue({
      type: "attempt",
      word: "apple",
      wordId: "id-apple",
      data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
    });
    expect(SyncQueueManager.getQueue()).toHaveLength(0);
  });

  it("removeFromQueue 按 id 移除", () => {
    const a = makeItem("apple");
    makeItem("banana");
    SyncQueueManager.removeFromQueue([a.id]);
    expect(SyncQueueManager.getQueue().map((item) => item.word)).toEqual([
      "banana",
    ]);
  });

  it("incrementRetries 未达上限时保留并返回空数组", () => {
    const item = makeItem("apple");
    const discarded = SyncQueueManager.incrementRetries([item.id]);
    expect(discarded).toEqual([]);
    expect(SyncQueueManager.getQueue()[0].retryCount).toBe(1);
  });

  it("incrementRetries 达到最大重试次数时丢弃并返回被丢弃条目", () => {
    const item = makeItem("apple");
    SyncQueueManager.incrementRetries([item.id]);
    SyncQueueManager.incrementRetries([item.id]);
    const discarded = SyncQueueManager.incrementRetries([item.id]);
    expect(discarded).toHaveLength(1);
    expect(discarded[0].word).toBe("apple");
    expect(SyncQueueManager.getQueue()).toHaveLength(0);
  });

  it("incrementRetries 只影响指定 id", () => {
    const a = makeItem("apple");
    const b = makeItem("banana");
    for (let i = 0; i < 3; i++) {
      SyncQueueManager.incrementRetries([a.id]);
    }
    const queue = SyncQueueManager.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(b.id);
    expect(queue[0].retryCount).toBe(0);
  });

  it("setUser 时迁移历史全局队列", () => {
    localStorageMock.clear();
    SyncQueueManager.setUser(null);
    localStorageMock.setItem(
      "sync_queue",
      JSON.stringify([
        {
          id: "legacy",
          type: "attempt",
          word: "apple",
          wordId: "id-apple",
          data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
          timestamp: 1,
          retryCount: 0,
        },
      ])
    );

    SyncQueueManager.setUser("user-1");
    expect(SyncQueueManager.getQueue()).toHaveLength(1);
    expect(localStorageMock.getItem("sync_queue")).toBeNull();
  });

  it("localStorage 写失败时回退内存副本", () => {
    const originalSetItem = localStorageMock.setItem.bind(localStorageMock);
    localStorageMock.setItem = () => {
      throw new Error("quota exceeded");
    };

    SyncQueueManager.addToQueue({
      type: "attempt",
      word: "apple",
      wordId: "id-apple",
      data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
    });

    expect(SyncQueueManager.hasMemoryFallback()).toBe(true);
    expect(SyncQueueManager.getQueue()).toHaveLength(1);

    SyncQueueManager.removeFromQueue(
      SyncQueueManager.getQueue().map((item) => item.id)
    );
    expect(SyncQueueManager.getQueue()).toHaveLength(0);

    localStorageMock.setItem = originalSetItem;
    SyncQueueManager.setUser("user-2");
    SyncQueueManager.setUser("user-1");
    expect(SyncQueueManager.hasMemoryFallback()).toBe(false);
  });
});
