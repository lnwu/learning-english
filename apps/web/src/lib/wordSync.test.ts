import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  buildAttemptQueueData,
  buildAttemptUpdateFields,
  buildWordUpdates,
  classifySyncBatchFailure,
  collectStaleQueueItemIds,
  runWordSync,
  type WordSyncQueuePort,
  type WordSyncUpdate,
} from "./wordSync";
import type { SyncQueueItem } from "./syncQueue";
import type { WordData } from "./wordsStore";

const makeItem = (overrides: Partial<SyncQueueItem> = {}): SyncQueueItem => ({
  id: "q1",
  type: "attempt",
  word: "apple",
  wordId: "id-apple",
  data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

const makeWordData = (overrides: Partial<WordData> = {}): WordData => ({
  word: "apple",
  translation: "苹果",
  correctCount: 2,
  totalAttempts: 3,
  inputTimes: [1, 2],
  lastPracticedAt: new Date("2026-01-01T00:00:00"),
  correctPracticeDates: ["2026-01-01"],
  attemptHistory: [true, false, true],
  createdAt: new Date("2025-12-31T00:00:00"),
  id: "id-apple",
  ...overrides,
});

describe("buildWordUpdates", () => {
  it("按 wordId 取最后一条并保留时间戳与条目 id", () => {
    const updates = buildWordUpdates([
      makeItem({
        id: "q1",
        timestamp: 1000,
        data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
      }),
      makeItem({
        id: "q2",
        timestamp: 2000,
        data: { correctCount: 2, totalAttempts: 2, inputTimes: [1, 2] },
      }),
      makeItem({
        id: "q3",
        word: "banana",
        wordId: "id-banana",
        timestamp: 1500,
      }),
    ]);

    expect(updates.size).toBe(2);
    const apple = updates.get("id-apple")!;
    expect(apple.word).toBe("apple");
    expect(apple.data.totalAttempts).toBe(2);
    expect(apple.lastPracticedAt).toBe(2000);
    expect(apple.queueItemIds).toEqual(["q1", "q2"]);
    expect(updates.get("id-banana")!.queueItemIds).toEqual(["q3"]);
  });

  it("空队列返回空 Map", () => {
    expect(buildWordUpdates([]).size).toBe(0);
  });
});

describe("buildAttemptQueueData", () => {
  it("只保留需要同步的字段", () => {
    expect(buildAttemptQueueData(makeWordData())).toEqual({
      correctCount: 2,
      totalAttempts: 3,
      inputTimes: [1, 2],
      correctPracticeDates: ["2026-01-01"],
      attemptHistory: [true, false, true],
    });
  });
});

describe("buildAttemptUpdateFields", () => {
  it("可选字段存在时写入，lastPracticedAt 取队列时间戳", () => {
    const fields = buildAttemptUpdateFields(
      {
        correctCount: 2,
        totalAttempts: 3,
        inputTimes: [1, 2],
        correctPracticeDates: ["2026-01-01"],
        attemptHistory: [true, false],
      },
      1767225600000
    );

    expect(fields.correctCount).toBe(2);
    expect(fields.totalAttempts).toBe(3);
    expect(fields.inputTimes).toEqual([1, 2]);
    expect(fields.correctPracticeDates).toEqual(["2026-01-01"]);
    expect(fields.attemptHistory).toEqual([true, false]);
    expect(fields.lastPracticedAt).toBeInstanceOf(Date);
    expect(fields.lastPracticedAt.getTime()).toBe(1767225600000);
  });

  it("可选字段缺失时不写入对应键", () => {
    const fields = buildAttemptUpdateFields(
      { correctCount: 0, totalAttempts: 1, inputTimes: [] },
      1000
    );

    expect("correctPracticeDates" in fields).toBe(false);
    expect("attemptHistory" in fields).toBe(false);
    expect(fields.lastPracticedAt.getTime()).toBe(1000);
  });
});

describe("collectStaleQueueItemIds", () => {
  it("远端计数支配本地时判定为 stale", () => {
    const byId = new Map([["id-apple", makeWordData()]]);
    const staleIds = collectStaleQueueItemIds(byId, [makeItem()]);

    expect(staleIds).toEqual(["q1"]);
  });

  it("远端与队列完全一致时判定为 stale", () => {
    const byId = new Map([["id-apple", makeWordData()]]);
    const staleIds = collectStaleQueueItemIds(byId, [
      makeItem({
        data: {
          correctCount: 2,
          totalAttempts: 3,
          inputTimes: [1, 2],
          correctPracticeDates: ["2026-01-01"],
          attemptHistory: [true, false, true],
        },
      }),
    ]);

    expect(staleIds).toEqual(["q1"]);
  });

  it("队列计数更高或远端无该词时不判定为 stale", () => {
    const byId = new Map([
      [
        "id-apple",
        makeWordData({ correctCount: 1, totalAttempts: 1, inputTimes: [1] }),
      ],
    ]);
    const staleIds = collectStaleQueueItemIds(byId, [
      makeItem({
        data: { correctCount: 5, totalAttempts: 9, inputTimes: [1] },
      }),
      makeItem({ id: "q2", wordId: "id-missing" }),
    ]);

    expect(staleIds).toEqual([]);
  });
});

describe("classifySyncBatchFailure", () => {
  const updates = [
    { word: "gone", queueItemIds: ["q1"] },
    { word: "kept", queueItemIds: ["q2"] },
  ];

  it("not-found 且词库已确认该词不存在时归为 gone", () => {
    const result = classifySyncBatchFailure({
      errorCode: "not-found",
      wordsLoaded: true,
      updates,
      wordExists: (word) => word === "kept",
    });

    expect(result.goneQueueItemIds).toEqual(["q1"]);
    expect(result.retryQueueItemIds).toEqual(["q2"]);
  });

  it("词库尚未加载完成时全部重试", () => {
    const result = classifySyncBatchFailure({
      errorCode: "not-found",
      wordsLoaded: false,
      updates,
      wordExists: () => false,
    });

    expect(result.goneQueueItemIds).toEqual([]);
    expect(result.retryQueueItemIds).toEqual(["q1", "q2"]);
  });

  it("非 not-found 错误全部重试", () => {
    const result = classifySyncBatchFailure({
      errorCode: "unavailable",
      wordsLoaded: true,
      updates,
      wordExists: () => false,
    });

    expect(result.goneQueueItemIds).toEqual([]);
    expect(result.retryQueueItemIds).toEqual(["q1", "q2"]);
  });
});

const makeUpdate = (
  overrides: Partial<WordSyncUpdate> = {}
): WordSyncUpdate => ({
  word: "apple",
  data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
  lastPracticedAt: 1000,
  queueItemIds: ["q1"],
  ...overrides,
});

const createQueuePort = () => {
  const removed: string[] = [];
  const incrementCalls: string[][] = [];
  let discardedIds: string[] = [];

  const port: WordSyncQueuePort = {
    remove: (ids) => {
      removed.push(...ids);
    },
    incrementRetries: (ids) => {
      incrementCalls.push(ids);
      return ids.filter((id) => discardedIds.includes(id));
    },
  };

  return {
    port,
    removed,
    incrementCalls,
    setDiscardedIds: (ids: string[]) => {
      discardedIds = ids;
    },
  };
};

describe("runWordSync", () => {
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("逐片写入成功后出队，并汇总 committed", async () => {
    const queue = createQueuePort();
    const chunks: string[][] = [];

    const result = await runWordSync({
      entries: [
        ["id-apple", makeUpdate({ queueItemIds: ["q1"] })],
        ["id-banana", makeUpdate({ word: "banana", queueItemIds: ["q2"] })],
        ["id-cherry", makeUpdate({ word: "cherry", queueItemIds: ["q3"] })],
      ],
      chunkSize: 2,
      isWordsLoaded: () => true,
      wordExists: () => true,
      writeChunk: async (chunk) => {
        chunks.push(chunk.map(([wordId]) => wordId));
      },
      queue: queue.port,
    });

    expect(chunks).toEqual([["id-apple", "id-banana"], ["id-cherry"]]);
    expect(queue.removed).toEqual(["q1", "q2", "q3"]);
    expect(result).toEqual({
      committed: ["q1", "q2", "q3"],
      gone: [],
      retried: [],
      discarded: [],
    });
  });

  it("单片写入失败不阻断后续分片，失败片计入 retried", async () => {
    const queue = createQueuePort();

    const result = await runWordSync({
      entries: [
        ["id-apple", makeUpdate({ queueItemIds: ["q1"] })],
        ["id-banana", makeUpdate({ word: "banana", queueItemIds: ["q2"] })],
        ["id-cherry", makeUpdate({ word: "cherry", queueItemIds: ["q3"] })],
      ],
      chunkSize: 2,
      isWordsLoaded: () => true,
      wordExists: () => true,
      writeChunk: async (chunk) => {
        if (chunk.some(([wordId]) => wordId === "id-apple")) {
          throw { code: "unavailable" };
        }
      },
      queue: queue.port,
    });

    expect(queue.removed).toEqual(["q3"]);
    expect(queue.incrementCalls).toEqual([["q1", "q2"]]);
    expect(result.committed).toEqual(["q3"]);
    expect(result.retried).toEqual(["q1", "q2"]);
    expect(result.gone).toEqual([]);
  });

  it("not-found 且词库已加载时，已删除单词的条目出队，其余重试", async () => {
    const queue = createQueuePort();

    const result = await runWordSync({
      entries: [
        ["id-gone", makeUpdate({ word: "gone", queueItemIds: ["q1"] })],
        ["id-kept", makeUpdate({ word: "kept", queueItemIds: ["q2"] })],
      ],
      chunkSize: 500,
      isWordsLoaded: () => true,
      wordExists: (word) => word === "kept",
      writeChunk: async () => {
        throw { code: "not-found" };
      },
      queue: queue.port,
    });

    expect(queue.removed).toEqual(["q1"]);
    expect(queue.incrementCalls).toEqual([["q2"]]);
    expect(result.gone).toEqual(["q1"]);
    expect(result.retried).toEqual(["q2"]);
  });

  it("词库尚未加载完成时 not-found 也全部重试", async () => {
    const queue = createQueuePort();

    const result = await runWordSync({
      entries: [["id-gone", makeUpdate({ word: "gone", queueItemIds: ["q1"] })]],
      chunkSize: 500,
      isWordsLoaded: () => false,
      wordExists: () => false,
      writeChunk: async () => {
        throw { code: "not-found" };
      },
      queue: queue.port,
    });

    expect(queue.removed).toEqual([]);
    expect(queue.incrementCalls).toEqual([["q1"]]);
    expect(result.gone).toEqual([]);
    expect(result.retried).toEqual(["q1"]);
  });

  it("重试达到上限被丢弃时计入 discarded，不再计入 retried", async () => {
    const queue = createQueuePort();
    queue.setDiscardedIds(["q1"]);

    const result = await runWordSync({
      entries: [
        ["id-apple", makeUpdate({ queueItemIds: ["q1"] })],
        ["id-banana", makeUpdate({ word: "banana", queueItemIds: ["q2"] })],
      ],
      chunkSize: 500,
      isWordsLoaded: () => true,
      wordExists: () => true,
      writeChunk: async () => {
        throw { code: "unavailable" };
      },
      queue: queue.port,
    });

    expect(result.discarded).toEqual(["q1"]);
    expect(result.retried).toEqual(["q2"]);
  });

  it("空队列不写入且汇总为空", async () => {
    const queue = createQueuePort();
    const chunks: string[][] = [];

    const result = await runWordSync({
      entries: [],
      chunkSize: 500,
      isWordsLoaded: () => true,
      wordExists: () => true,
      writeChunk: async (chunk) => {
        chunks.push(chunk.map(([wordId]) => wordId));
      },
      queue: queue.port,
    });

    expect(chunks).toEqual([]);
    expect(result).toEqual({
      committed: [],
      gone: [],
      retried: [],
      discarded: [],
    });
  });
});
