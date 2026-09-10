import { describe, it, expect } from "bun:test";
import { buildAttemptQueueData, buildWordUpdates } from "./wordSync";
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
