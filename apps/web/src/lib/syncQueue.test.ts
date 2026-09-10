import { describe, it, expect, beforeEach } from "bun:test";
import { SyncQueueManager, type SyncQueueItem } from "./syncQueue";

class LocalStorageMock {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
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
    expect(localStorageMock.getItem("sync_queue:user-1:id-apple")).toBeTruthy();

    SyncQueueManager.setUser("user-2");
    expect(SyncQueueManager.getQueue()).toHaveLength(0);

    makeItem("banana");
    SyncQueueManager.setUser("user-1");
    expect(SyncQueueManager.getQueue().map((item) => item.word)).toEqual([
      "apple",
    ]);
  });

  it("不同单词各自独立存储，互不覆盖", () => {
    makeItem("apple");
    makeItem("banana");
    expect(localStorageMock.getItem("sync_queue:user-1:id-apple")).toBeTruthy();
    expect(
      localStorageMock.getItem("sync_queue:user-1:id-banana")
    ).toBeTruthy();

    const apple = SyncQueueManager.getQueue().find(
      (item) => item.word === "apple"
    )!;
    SyncQueueManager.removeFromQueue([apple.id]);
    expect(localStorageMock.getItem("sync_queue:user-1:id-apple")).toBeNull();
    expect(
      localStorageMock.getItem("sync_queue:user-1:id-banana")
    ).toBeTruthy();
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

  it("同一单词重复入队时合并为最新一条", () => {
    makeItem("apple");
    SyncQueueManager.addToQueue({
      type: "attempt",
      word: "apple",
      wordId: "id-apple",
      data: { correctCount: 2, totalAttempts: 2, inputTimes: [1, 2] },
    });
    const queue = SyncQueueManager.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].data.totalAttempts).toBe(2);
    expect(queue[0].data.inputTimes).toEqual([1, 2]);
  });

  it("重新入队后重试计数重置", () => {
    const item = makeItem("apple");
    SyncQueueManager.incrementRetries([item.id]);
    expect(SyncQueueManager.getQueue()[0].retryCount).toBe(1);

    SyncQueueManager.addToQueue({
      type: "attempt",
      word: "apple",
      wordId: "id-apple",
      data: { correctCount: 2, totalAttempts: 2, inputTimes: [1, 2] },
    });
    expect(SyncQueueManager.getQueue()[0].retryCount).toBe(0);
  });

  it("已有条目的尝试次数更多时不被较低计数覆盖", () => {
    makeItem("apple");
    SyncQueueManager.addToQueue({
      type: "attempt",
      word: "apple",
      wordId: "id-apple",
      data: { correctCount: 3, totalAttempts: 3, inputTimes: [1, 2, 3] },
    });
    SyncQueueManager.addToQueue({
      type: "attempt",
      word: "apple",
      wordId: "id-apple",
      data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
    });

    const queue = SyncQueueManager.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].data.totalAttempts).toBe(3);
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

  it("setUser 时迁移按 uid 的旧数组队列", () => {
    localStorageMock.clear();
    SyncQueueManager.setUser(null);
    localStorageMock.setItem(
      "sync_queue:user-1",
      JSON.stringify([
        {
          id: "legacy-user",
          type: "attempt",
          word: "banana",
          wordId: "id-banana",
          data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
          timestamp: 1,
          retryCount: 0,
        },
      ])
    );

    SyncQueueManager.setUser("user-1");
    expect(SyncQueueManager.getQueue()).toHaveLength(1);
    expect(SyncQueueManager.getQueue()[0].word).toBe("banana");
    expect(localStorageMock.getItem("sync_queue:user-1")).toBeNull();
    expect(
      localStorageMock.getItem("sync_queue:user-1:id-banana")
    ).toBeTruthy();
  });

  it("迁移写入失败时保留旧数组队列，clearQueue 会一并清理", () => {
    localStorageMock.clear();
    SyncQueueManager.setUser(null);
    localStorageMock.setItem(
      "sync_queue:user-1",
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

    const originalSetItem = localStorageMock.setItem.bind(localStorageMock);
    localStorageMock.setItem = () => {
      throw new Error("quota exceeded");
    };
    try {
      SyncQueueManager.setUser("user-1");
      expect(localStorageMock.getItem("sync_queue:user-1")).toBeTruthy();

      SyncQueueManager.clearQueue();
      expect(localStorageMock.getItem("sync_queue:user-1")).toBeNull();
    } finally {
      localStorageMock.setItem = originalSetItem;
    }
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
