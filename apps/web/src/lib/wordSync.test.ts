import { describe, it, expect } from "bun:test";
import {
  buildAttemptQueueData,
  buildAttemptUpdateFields,
  buildWordUpdates,
  classifySyncBatchFailure,
  collectStaleQueueItemIds,
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
