import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  createLocalStorageQueueStorage,
  createMemoryQueueStorage,
  createNoopQueueStorage,
  type SyncQueueItem,
} from "./queueStorage";

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

const makeItem = (
  wordId: string,
  word: string,
  overrides: Partial<SyncQueueItem> = {}
): SyncQueueItem => ({
  id: `q-${wordId}`,
  type: "attempt",
  word,
  wordId,
  data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
  timestamp: 1,
  retryCount: 0,
  ...overrides,
});

const legacyItem = (wordId: string, word: string) => ({
  id: `legacy-${wordId}`,
  type: "attempt",
  word,
  wordId,
  data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
  timestamp: 1,
  retryCount: 0,
});

describe("createNoopQueueStorage", () => {
  it("不持有任何状态且不报告内存回退", () => {
    const storage = createNoopQueueStorage();
    storage.save(makeItem("id-apple", "apple"));
    expect(storage.load()).toEqual([]);
    expect(storage.get("id-apple")).toBeNull();
    expect(storage.usingMemoryFallback).toBe(false);
  });
});

describe("createMemoryQueueStorage", () => {
  it("以 wordId 为键 upsert，并按 id 移除", () => {
    const storage = createMemoryQueueStorage();
    storage.save(makeItem("id-apple", "apple"));
    storage.save(makeItem("id-apple", "apple", { id: "q-newer" }));
    expect(storage.load()).toHaveLength(1);
    expect(storage.get("id-apple")?.id).toBe("q-newer");

    storage.save(makeItem("id-banana", "banana"));
    storage.removeByIds(["q-newer"]);
    expect(storage.load().map((item) => item.word)).toEqual(["banana"]);

    storage.clear();
    expect(storage.load()).toEqual([]);
  });
});

describe("createLocalStorageQueueStorage", () => {
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    localStorageMock.clear();
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("按 uid 隔离存储", () => {
    const user1 = createLocalStorageQueueStorage("user-1");
    user1.save(makeItem("id-apple", "apple"));

    expect(localStorageMock.getItem("sync_queue:user-1:id-apple")).toBeTruthy();

    const user2 = createLocalStorageQueueStorage("user-2");
    expect(user2.load()).toHaveLength(0);

    user2.save(makeItem("id-banana", "banana"));
    expect(user1.load().map((item) => item.word)).toEqual(["apple"]);
  });

  it("以 wordId 为键 upsert，不产生重复条目", () => {
    const storage = createLocalStorageQueueStorage("user-1");
    storage.save(makeItem("id-apple", "apple"));
    storage.save(
      makeItem("id-apple", "apple", {
        id: "q-newer",
        data: { correctCount: 2, totalAttempts: 2, inputTimes: [1, 2] },
      })
    );

    expect(storage.load()).toHaveLength(1);
    expect(storage.get("id-apple")?.data.totalAttempts).toBe(2);
  });

  it("removeByIds 只移除指定条目", () => {
    const storage = createLocalStorageQueueStorage("user-1");
    storage.save(makeItem("id-apple", "apple"));
    storage.save(makeItem("id-banana", "banana"));

    storage.removeByIds(["q-id-apple"]);
    expect(localStorageMock.getItem("sync_queue:user-1:id-apple")).toBeNull();
    expect(
      localStorageMock.getItem("sync_queue:user-1:id-banana")
    ).toBeTruthy();
  });

  it("忽略格式非法或缺少 wordId 的条目", () => {
    const storage = createLocalStorageQueueStorage("user-1");
    localStorageMock.setItem("sync_queue:user-1:broken", "{not json");
    localStorageMock.setItem(
      "sync_queue:user-1:no-word",
      JSON.stringify({ id: "q", data: { totalAttempts: 1 } })
    );
    localStorageMock.setItem(
      "sync_queue:user-1:no-attempts",
      JSON.stringify({ id: "q", wordId: "id-x", data: {} })
    );

    expect(storage.load()).toEqual([]);
  });

  it("首次访问时迁移历史全局数组队列", () => {
    localStorageMock.setItem(
      "sync_queue",
      JSON.stringify([legacyItem("id-apple", "apple")])
    );

    const storage = createLocalStorageQueueStorage("user-1");
    expect(storage.load()).toHaveLength(1);
    expect(localStorageMock.getItem("sync_queue")).toBeNull();
    expect(localStorageMock.getItem("sync_queue:user-1:id-apple")).toBeTruthy();
  });

  it("首次访问时迁移按 uid 的旧数组队列", () => {
    localStorageMock.setItem(
      "sync_queue:user-1",
      JSON.stringify([legacyItem("id-banana", "banana")])
    );

    const storage = createLocalStorageQueueStorage("user-1");
    expect(storage.load()[0].word).toBe("banana");
    expect(localStorageMock.getItem("sync_queue:user-1")).toBeNull();
    expect(
      localStorageMock.getItem("sync_queue:user-1:id-banana")
    ).toBeTruthy();
  });

  it("迁移写入失败时保留旧数组队列，clear 会一并清理", () => {
    localStorageMock.setItem(
      "sync_queue:user-1",
      JSON.stringify([legacyItem("id-apple", "apple")])
    );
    const originalSetItem = localStorageMock.setItem.bind(localStorageMock);
    localStorageMock.setItem = () => {
      throw new Error("quota exceeded");
    };

    try {
      const storage = createLocalStorageQueueStorage("user-1");
      expect(storage.load()).toEqual([]);
      expect(localStorageMock.getItem("sync_queue:user-1")).toBeTruthy();

      storage.clear();
      expect(localStorageMock.getItem("sync_queue:user-1")).toBeNull();
    } finally {
      localStorageMock.setItem = originalSetItem;
    }
  });

  it("写失败时回退内存副本，clear 后重置回退状态", () => {
    const originalSetItem = localStorageMock.setItem.bind(localStorageMock);
    localStorageMock.setItem = () => {
      throw new Error("quota exceeded");
    };

    try {
      const storage = createLocalStorageQueueStorage("user-1");
      expect(storage.usingMemoryFallback).toBe(false);

      storage.save(makeItem("id-apple", "apple"));
      expect(storage.usingMemoryFallback).toBe(true);
      expect(storage.load()).toHaveLength(1);
      expect(storage.get("id-apple")?.word).toBe("apple");

      storage.removeByIds(["q-id-apple"]);
      expect(storage.load()).toHaveLength(0);
    } finally {
      localStorageMock.setItem = originalSetItem;
    }

    const fresh = createLocalStorageQueueStorage("user-2");
    expect(fresh.usingMemoryFallback).toBe(false);
  });

  it("写失败后新写入口仍以内存为准，不回读旧 localStorage 数据", () => {
    const storage = createLocalStorageQueueStorage("user-1");
    storage.save(makeItem("id-banana", "banana"));

    const originalSetItem = localStorageMock.setItem.bind(localStorageMock);
    localStorageMock.setItem = () => {
      throw new Error("quota exceeded");
    };

    try {
      storage.save(makeItem("id-apple", "apple"));
    } finally {
      localStorageMock.setItem = originalSetItem;
    }

    expect(storage.usingMemoryFallback).toBe(true);
    expect(storage.load().map((item) => item.word)).toEqual([
      "banana",
      "apple",
    ]);
  });
});
