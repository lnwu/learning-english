import { describe, it, expect } from "bun:test";
import {
  Words,
  isQueueItemStale,
  mergeSnapshotIntoStore,
  mergeWordData,
  type WordData,
} from "./wordsStore";
import {
  DAY_MS,
  MAX_INPUT_TIMES,
  MAX_REVIEWS,
  initialMemory,
  initialStats,
  type WordMemory,
  type WordStats,
} from "./masteryModel";

const memory = (overrides: Partial<WordMemory> = {}): WordMemory => ({
  ...initialMemory(0),
  ...overrides,
});

const stats = (overrides: Partial<WordStats> = {}): WordStats => ({
  ...initialStats(),
  ...overrides,
});

const makeWordData = (word: string, overrides: Partial<WordData> = {}): WordData => ({
  word,
  translation: `${word}-中文`,
  memory: memory(),
  stats: stats(),
  inputTimes: [],
  reviews: [],
  createdAt: new Date(0),
  id: `id-${word}`,
  ...overrides,
});

const addWord = (store: Words, word: string, overrides: Partial<WordData> = {}) => {
  const data = makeWordData(word, overrides);
  store.setWordData(word, data);
  return data;
};

const dueReviewMemory = (now: number): WordMemory =>
  memory({
    stability: 10,
    difficulty: 5,
    state: "review",
    due: now - DAY_MS,
    lastReviewAt: now - 10 * DAY_MS,
    lastGrade: 3,
    reps: 3,
  });

describe("recordReview", () => {
  it("新词独立答对写入记忆状态、复习日与计时", () => {
    const store = new Words();
    addWord(store, "apple");
    const now = Date.UTC(2026, 0, 1, 10);

    store.recordReview("apple", 3, { inputTimeSeconds: 2, now });

    const data = store.getWordData("apple")!;
    expect(data.memory.state).toBe("learning");
    expect(data.memory.reps).toBe(1);
    expect(data.memory.lastGrade).toBe(3);
    expect(data.stats.reviewDays).toBe(1);
    expect(data.stats.dailyReviews).toBe(1);
    expect(data.stats.lastReviewDay).toBe("2026-01-01");
    expect(data.reviews).toHaveLength(1);
    expect(data.reviews[0]).toMatchObject({ g: 3, h: false, r: null });
    expect(data.inputTimes).toEqual([2]);
  });

  it("答错进入 1 分钟学习步且不记录计时", () => {
    const store = new Words();
    addWord(store, "apple");
    const now = Date.UTC(2026, 0, 1, 10);

    store.recordReview("apple", 1, { inputTimeSeconds: 2, now });

    const data = store.getWordData("apple")!;
    expect(data.memory.state).toBe("learning");
    expect(data.memory.due).toBe(now + 60 * 1000);
    expect(data.inputTimes).toEqual([]);
  });

  it("用过提示记为 Hard 并累计提示数", () => {
    const store = new Words();
    addWord(store, "apple");
    const now = Date.UTC(2026, 0, 1, 10);

    store.recordReview("apple", 2, { hint: true, inputTimeSeconds: 3, now });

    const data = store.getWordData("apple")!;
    expect(data.memory.lastGrade).toBe(2);
    expect(data.stats.hints).toBe(1);
    expect(data.reviews[0]).toMatchObject({ g: 2, h: true });
    expect(data.inputTimes).toEqual([3]);
  });

  it("同日多次复习只计一个复习日", () => {
    const store = new Words();
    addWord(store, "apple");
    const now = Date.UTC(2026, 0, 1, 10);

    store.recordReview("apple", 3, { now });
    store.recordReview("apple", 3, { now: now + 10 * 60 * 1000 });

    const data = store.getWordData("apple")!;
    expect(data.stats.reviewDays).toBe(1);
    expect(data.stats.dailyReviews).toBe(2);
    expect(data.reviews).toHaveLength(2);
    expect(data.reviews[1].r).toBe(1);
  });

  it("跨天复习累计复习日并重置当日计数", () => {
    const store = new Words();
    addWord(store, "apple");
    const day1 = Date.UTC(2026, 0, 1, 10);

    store.recordReview("apple", 3, { now: day1 });
    store.recordReview("apple", 3, { now: day1 + DAY_MS });

    const data = store.getWordData("apple")!;
    expect(data.stats.reviewDays).toBe(2);
    expect(data.stats.dailyReviews).toBe(1);
  });

  it("复习日志与耗时样本按上限截断", () => {
    const store = new Words();
    addWord(store, "apple");
    const start = Date.UTC(2026, 0, 1);

    for (let i = 0; i < MAX_REVIEWS + 5; i++) {
      store.recordReview("apple", 3, {
        inputTimeSeconds: i,
        now: start + i * 1000,
      });
    }

    const data = store.getWordData("apple")!;
    expect(data.reviews).toHaveLength(MAX_REVIEWS);
    expect(data.inputTimes).toHaveLength(MAX_INPUT_TIMES);
    expect(data.inputTimes.at(-1)).toBe(MAX_REVIEWS + 4);
  });

  it("重置清空练习数据回到 new", () => {
    const store = new Words();
    addWord(store, "apple");
    store.recordReview("apple", 3, { inputTimeSeconds: 2 });

    const reset = store.resetPracticeRecords();

    expect(reset).toHaveLength(1);
    const data = store.getWordData("apple")!;
    expect(data.memory.state).toBe("new");
    expect(data.memory.reps).toBe(0);
    expect(data.stats.reviewDays).toBe(0);
    expect(data.inputTimes).toEqual([]);
    expect(data.reviews).toEqual([]);
  });
});

describe("熟练度分数", () => {
  it("随跨天复习与稳定度提升", () => {
    const store = new Words();
    addWord(store, "apple");
    const day1 = Date.UTC(2026, 0, 1, 10);

    expect(store.getMasteryScore("apple")).toBe(0);
    store.recordReview("apple", 3, { now: day1 });
    const afterFirst = store.getMasteryScore("apple");
    expect(afterFirst).toBeGreaterThan(0);
    expect(store.getMasteryLevelIndex("apple")).toBe(1);

    store.recordReview("apple", 3, { now: day1 + DAY_MS });
    expect(store.getMasteryScore("apple")).toBeGreaterThan(afterFirst);
  });
});

describe("getRandomWords", () => {
  it("只有新词时按配额并补位填满一轮", () => {
    const store = new Words();
    for (let i = 0; i < 6; i++) addWord(store, `word${i}`);

    const picked = store.getRandomWords(5);

    expect(picked).toHaveLength(5);
    expect(new Set(picked.map(([word]) => word)).size).toBe(5);
  });

  it("学习步到期的词最先出现", () => {
    const store = new Words();
    const now = Date.now();
    addWord(store, "step", {
      memory: memory({ state: "learning", stability: 1, due: now - 1000 }),
      stats: stats({ reviewDays: 1, lastReviewDay: "2026-01-01" }),
    });
    for (let i = 0; i < 5; i++) addWord(store, `word${i}`);

    const picked = store.getRandomWords(3);

    expect(picked[0][0]).toBe("step");
  });

  it("到期复习排在 new 之前", () => {
    const store = new Words();
    const now = Date.now();
    addWord(store, "due", {
      memory: dueReviewMemory(now),
      stats: stats({ reviewDays: 1, lastReviewDay: "2026-01-01" }),
    });
    for (let i = 0; i < 5; i++) addWord(store, `word${i}`);

    const picked = store.getRandomWords(3);

    expect(picked[0][0]).toBe("due");
  });

  it("当天已达复习上限的词跳过", () => {
    const store = new Words();
    const now = Date.now();
    const today = new Date(now);
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    addWord(store, "capped", {
      memory: dueReviewMemory(now),
      stats: stats({
        reviewDays: 1,
        lastReviewDay: todayKey,
        dailyReviews: 3,
      }),
    });
    addWord(store, "fresh", {
      memory: dueReviewMemory(now),
      stats: stats({ reviewDays: 1, lastReviewDay: "2026-01-01" }),
    });

    const picked = store.getRandomWords(5);

    expect(picked.map(([word]) => word)).toEqual(["fresh"]);
  });

  it("所有词都达上限且没有新词时返回空数组", () => {
    const store = new Words();
    const now = Date.now();
    const today = new Date(now);
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    addWord(store, "capped", {
      memory: dueReviewMemory(now),
      stats: stats({
        reviewDays: 1,
        lastReviewDay: todayKey,
        dailyReviews: 3,
      }),
    });

    expect(store.getRandomWords(5)).toEqual([]);
  });

  it("当天已复习的常规词不参与补位", () => {
    const store = new Words();
    const now = Date.now();
    const today = new Date(now);
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    addWord(store, "reviewed", {
      memory: dueReviewMemory(now),
      stats: stats({
        reviewDays: 1,
        lastReviewDay: todayKey,
        dailyReviews: 1,
      }),
    });
    addWord(store, "other", {
      memory: dueReviewMemory(now),
      stats: stats({ reviewDays: 1, lastReviewDay: "2026-01-01" }),
    });

    const picked = store.getRandomWords(5);

    expect(picked.map(([word]) => word)).toEqual(["other"]);
  });

  it("空词库返回空数组", () => {
    expect(new Words().getRandomWords()).toEqual([]);
  });
});

describe("practiceStats", () => {
  it("按熟练度升序并携带复习与提示计数", () => {
    const store = new Words();
    addWord(store, "apple");
    addWord(store, "banana");
    store.recordReview("banana", 3, { now: Date.UTC(2026, 0, 1) });
    store.recordReview("apple", 2, { hint: true, now: Date.UTC(2026, 0, 1) });

    const stats = store.practiceStats;

    expect(stats.map((item) => item.word)).toEqual(["apple", "banana"]);
    expect(stats[0]).toMatchObject({ reviews: 1, hints: 1 });
  });
});

describe("mergeWordData", () => {
  it("取复习更晚的记忆、最大统计与并集日志", () => {
    const target = makeWordData("apple", {
      memory: memory({ lastReviewAt: 2000, stability: 10, state: "review" }),
      stats: stats({ reviewDays: 2, hints: 1 }),
      inputTimes: [3],
      reviews: [{ id: "r2", at: 2000, g: 3, h: false, r: 0.9, s: 10, d: 5 }],
    });
    const source = makeWordData("apples", {
      memory: memory({ lastReviewAt: 1000, stability: 2, state: "review" }),
      stats: stats({ reviewDays: 1 }),
      inputTimes: [1, 2],
      reviews: [{ id: "r1", at: 1000, g: 3, h: false, r: null, s: 2, d: 5 }],
    });

    const merged = mergeWordData(target, source);

    expect(merged.memory.lastReviewAt).toBe(2000);
    expect(merged.stats.reviewDays).toBe(2);
    expect(merged.stats.hints).toBe(1);
    expect(merged.inputTimes).toEqual([3, 1, 2]);
    expect(merged.reviews.map((entry) => entry.id)).toEqual(["r1", "r2"]);
  });

  it("复习时间相同时取稳定度更低的一侧", () => {
    const target = makeWordData("apple", {
      memory: memory({ lastReviewAt: 1000, stability: 2, state: "review" }),
    });
    const source = makeWordData("apples", {
      memory: memory({ lastReviewAt: 1000, stability: 10, state: "review" }),
    });

    expect(mergeWordData(target, source).memory.stability).toBe(2);
  });
});

describe("isQueueItemStale", () => {
  it("远端复习更晚或完全一致时为 stale", () => {
    const syncable = {
      memory: memory({ lastReviewAt: 1000, state: "review" }),
      stats: stats(),
      inputTimes: [],
      reviews: [],
    };

    expect(
      isQueueItemStale(
        { ...syncable, memory: memory({ lastReviewAt: 2000, state: "review" }) },
        syncable,
      ),
    ).toBe(true);
    expect(isQueueItemStale(syncable, syncable)).toBe(true);
    expect(
      isQueueItemStale(
        { ...syncable, memory: memory({ lastReviewAt: 500, state: "review" }) },
        syncable,
      ),
    ).toBe(false);
  });
});

describe("mergeSnapshotIntoStore", () => {
  it("远端更旧时叠加本地队列数据", () => {
    const store = new Words();
    const remote = makeWordData("apple", {
      memory: memory({ lastReviewAt: 1000, state: "review", stability: 2 }),
      stats: stats({ reviewDays: 1 }),
    });
    const pending = {
      wordId: remote.id,
      data: {
        memory: memory({ lastReviewAt: 2000, state: "review", stability: 5 }),
        stats: stats({ reviewDays: 2 }),
        inputTimes: [1],
        reviews: [{ id: "r2", at: 2000, g: 3 as const, h: false, r: 0.9, s: 5, d: 5 }],
      },
    };

    mergeSnapshotIntoStore(
      store,
      {
        docs: [
          {
            id: remote.id,
            data: () => ({ ...remote, createdAt: { toDate: () => remote.createdAt } }),
          },
        ],
      },
      [pending],
    );

    const data = store.getWordData("apple")!;
    expect(data.memory.lastReviewAt).toBe(2000);
    expect(data.stats.reviewDays).toBe(2);
  });
});
