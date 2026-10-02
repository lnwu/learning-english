import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  createLocalStorageQueueStorage,
  createNoopQueueStorage,
  type SyncQueueItem,
} from "./queueStorage";
import { makeSyncable } from "./testSupport";

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
  overrides: Partial<SyncQueueItem> = {},
): SyncQueueItem => ({
  id: `q-${wordId}`,
  type: "attempt",
  word,
  wordId,
  data: makeSyncable(),
  timestamp: 1,
  retryCount: 0,
  ...overrides,
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
        data: makeSyncable(2000),
      }),
    );

    expect(storage.load()).toHaveLength(1);
    expect(storage.get("id-apple")?.data.memory.lastReviewAt).toBe(2000);
  });

  it("removeByIds 只移除指定条目", () => {
    const storage = createLocalStorageQueueStorage("user-1");
    storage.save(makeItem("id-apple", "apple"));
    storage.save(makeItem("id-banana", "banana"));

    storage.removeByIds(["q-id-apple"]);
    expect(localStorageMock.getItem("sync_queue:user-1:id-apple")).toBeNull();
    expect(localStorageMock.getItem("sync_queue:user-1:id-banana")).toBeTruthy();
  });

  it("忽略格式非法或缺少 wordId 的条目", () => {
    localStorageMock.setItem("sync_queue:user-1:broken", "{not json");
    localStorageMock.setItem(
      "sync_queue:user-1:no-word",
      JSON.stringify({ id: "q", data: { totalAttempts: 1 } }),
    );
    localStorageMock.setItem(
      "sync_queue:user-1:no-attempts",
      JSON.stringify({ id: "q", wordId: "id-x", data: {} }),
    );

    const storage = createLocalStorageQueueStorage("user-1");
    expect(storage.load()).toEqual([]);
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
    expect(storage.load().map((item) => item.word)).toEqual(["banana", "apple"]);
  });
});
