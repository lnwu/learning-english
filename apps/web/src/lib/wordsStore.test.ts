import { describe, it, expect, beforeEach, spyOn, setSystemTime } from "bun:test";
import {
  Words,
  isWordDataEqual,
  isQueueItemStale,
  isSyncableDataEqual,
  mergeSnapshotIntoStore,
  mergeWordData,
  type WordData,
} from "./wordsStore";
import { calculatePriority } from "./masteryCalculator";
import { formatLocalPracticeDate } from "./practiceDate";

const makeWordData = (overrides: Partial<WordData> = {}): WordData => ({
  word: "apple",
  translation: "苹果",
  correctCount: 0,
  totalAttempts: 0,
  inputTimes: [],
  lastPracticedAt: null,
  correctPracticeDates: [],
  attemptHistory: [],
  createdAt: new Date("2026-01-01T00:00:00"),
  id: "id-apple",
  ...overrides,
});

describe("Words store", () => {
  let store: Words;

  beforeEach(() => {
    store = new Words();
    store.setWordData("apple", makeWordData());
  });

  it("recordCorrectAttempt 累计计数并记录输入耗时与练习时间", () => {
    store.recordCorrectAttempt("apple", 2.5);
    const data = store.getWordData("apple")!;
    expect(data.correctCount).toBe(1);
    expect(data.totalAttempts).toBe(1);
    expect(data.inputTimes).toEqual([2.5]);
    expect(data.lastPracticedAt).toBeInstanceOf(Date);
    expect(data.correctPracticeDates).toEqual([
      formatLocalPracticeDate(new Date()),
    ]);
    expect(data.attemptHistory).toEqual([true]);
  });

  it("recordCorrectAttempt 不传 inputTimeSeconds 时不记录耗时", () => {
    store.recordCorrectAttempt("apple");
    expect(store.getWordData("apple")!.inputTimes).toEqual([]);
    expect(store.getWordData("apple")!.correctCount).toBe(1);
  });

  it("recordCorrectAttempt 同一天不重复记录 correctPracticeDates", () => {
    store.recordCorrectAttempt("apple");
    store.recordCorrectAttempt("apple");
    expect(store.getWordData("apple")!.correctPracticeDates).toHaveLength(1);
  });

  it("inputTimes 超过上限时只保留最近记录", () => {
    for (let i = 0; i < Words.MAX_INPUT_TIMES + 5; i++) {
      store.recordCorrectAttempt("apple", i);
    }
    const times = store.getWordData("apple")!.inputTimes;
    expect(times).toHaveLength(Words.MAX_INPUT_TIMES);
    expect(times[times.length - 1]).toBe(Words.MAX_INPUT_TIMES + 4);
    expect(times[0]).toBe(5);
  });

  it("correctPracticeDates 超过上限时只保留最近记录", () => {
    const dates = Array.from({ length: Words.MAX_CORRECT_PRACTICE_DATES + 5 }, (_, i) =>
      `2026-01-${String(i + 1).padStart(2, "0")}`
    );
    store.setWordData("apple", makeWordData({ correctPracticeDates: dates }));
    store.recordCorrectAttempt("apple");
    const result = store.getWordData("apple")!.correctPracticeDates;
    expect(result).toHaveLength(Words.MAX_CORRECT_PRACTICE_DATES);
    expect(result[result.length - 1]).toBe(formatLocalPracticeDate(new Date()));
  });

  it("recordIncorrectAttempt 只累计总次数，不计正确", () => {
    store.recordIncorrectAttempt("apple");
    const data = store.getWordData("apple")!;
    expect(data.totalAttempts).toBe(1);
    expect(data.correctCount).toBe(0);
    expect(data.lastPracticedAt).toBeInstanceOf(Date);
    expect(data.attemptHistory).toEqual([false]);
  });

  it("attemptHistory 超过上限时只保留最近记录", () => {
    for (let i = 0; i < Words.MAX_ATTEMPT_HISTORY + 5; i++) {
      store.recordCorrectAttempt("apple", 1);
    }
    const history = store.getWordData("apple")!.attemptHistory;
    expect(history).toHaveLength(Words.MAX_ATTEMPT_HISTORY);
    expect(history).toEqual(
      Array.from({ length: Words.MAX_ATTEMPT_HISTORY }, () => true)
    );
  });

  it("对不存在的单词记录尝试时静默忽略", () => {
    store.recordCorrectAttempt("ghost");
    store.recordIncorrectAttempt("ghost");
    expect(store.wordCount).toBe(1);
  });

  it("recordCorrectAttempt 后熟练度缓存失效", () => {
    const before = store.getMasteryScore("apple");
    store.recordCorrectAttempt("apple", 1);
    const after = store.getMasteryScore("apple");
    expect(after).not.toBe(before);
  });

  it("getRandomWords 不重复且不超过上限", () => {
    store.removeAllWords();
    for (let i = 0; i < 7; i++) {
      store.setWordData(
        `word${i}`,
        makeWordData({
          word: `word${i}`,
          translation: `译${i}`,
          id: `id-${i}`,
          totalAttempts: 1,
        })
      );
    }
    const selected = store.getRandomWords(5);
    expect(selected).toHaveLength(5);
    expect(new Set(selected.map(([word]) => word)).size).toBe(5);
  });

  it("getRandomWords 每轮新词数量受配额限制", () => {
    store.removeAllWords();
    for (let i = 0; i < 10; i++) {
      store.setWordData(
        `new${i}`,
        makeWordData({ word: `new${i}`, id: `id-new${i}` })
      );
    }
    for (let i = 0; i < 10; i++) {
      store.setWordData(
        `old${i}`,
        makeWordData({
          word: `old${i}`,
          id: `id-old${i}`,
          totalAttempts: 5,
        })
      );
    }

    const selected = store.getRandomWords(5);
    expect(selected).toHaveLength(5);
    expect(
      selected.filter(([word]) => word.startsWith("new")).length
    ).toBe(Words.MAX_NEW_WORDS_PER_ROUND);
  });

  it("getRandomWords 只有新词时仍能抽满一轮", () => {
    store.removeAllWords();
    for (let i = 0; i < 6; i++) {
      store.setWordData(
        `new${i}`,
        makeWordData({ word: `new${i}`, id: `id-new${i}` })
      );
    }
    expect(store.getRandomWords(5)).toHaveLength(5);
  });

  it("getRandomWords 复习词不足时用新词补位", () => {
    store.removeAllWords();
    store.setWordData("old1", makeWordData({ word: "old1", totalAttempts: 3 }));
    store.setWordData("new1", makeWordData({ word: "new1", id: "id-new1" }));
    store.setWordData("new2", makeWordData({ word: "new2", id: "id-new2" }));

    const selected = store.getRandomWords(5);
    expect(selected).toHaveLength(3);
    expect(
      selected.filter(([word]) => word.startsWith("old")).length
    ).toBe(1);
  });

  it("getRandomWords 词数不足时返回全部", () => {
    const selected = store.getRandomWords(5);
    expect(selected).toEqual([["apple", "苹果"]]);
  });

  it("getRandomWords 空词库返回空数组", () => {
    store.removeAllWords();
    expect(store.getRandomWords()).toEqual([]);
  });

  it("practiceStats 按熟练度升序排列", () => {
    store.setWordData(
      "banana",
      makeWordData({ word: "banana", translation: "香蕉", id: "id-banana" })
    );
    store.recordCorrectAttempt("banana", 1);
    const stats = store.practiceStats;
    expect(stats[0].word).toBe("apple");
    expect(stats[1].word).toBe("banana");
    expect(stats[0].masteryScore).toBeLessThanOrEqual(stats[1].masteryScore);
  });

  it("overallAverageInputTime 无记录时返回 null", () => {
    expect(store.overallAverageInputTime).toBeNull();
    store.recordCorrectAttempt("apple", 2);
    store.recordCorrectAttempt("apple", 4);
    expect(store.overallAverageInputTime).toBe(3);
  });

  it("速度分使用同长度档的个人打字基线", () => {
    const timed = (
      word: string,
      correct: number,
      total: number,
      times: number[],
      history: boolean[]
    ) =>
      makeWordData({
        word,
        id: `id-${word}`,
        correctCount: correct,
        totalAttempts: total,
        inputTimes: times,
        attemptHistory: history,
        correctPracticeDates: ["2026-08-08", "2026-08-12", "2026-08-17"],
      });

    store.removeAllWords();
    for (const word of ["grape", "lemon", "peach", "berry"]) {
      store.setWordData(
        word,
        timed(word, 5, 5, [4, 4, 4, 4, 4], Array(5).fill(true))
      );
    }
    store.setWordData(
      "apple",
      timed("apple", 7, 8, [4, 4, 4, 4, 4], [...Array(7).fill(true), false])
    );

    expect(store.getMasteryScore("apple")).toBeGreaterThanOrEqual(80);
  });

  it("同长度档其他词的计时变化会重算该词分数", () => {
    const timed = (word: string, times: number[]) =>
      makeWordData({
        word,
        id: `id-${word}`,
        correctCount: 8,
        totalAttempts: 8,
        inputTimes: times,
        attemptHistory: Array(8).fill(true),
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      });

    store.removeAllWords();
    store.setWordData("apple", timed("apple", [4, 4, 4, 4, 4]));
    store.setWordData("grape", timed("grape", [2, 2, 2, 2, 2]));

    const before = store.getMasteryScore("apple");
    store.setWordData("grape", timed("grape", [8, 8, 8, 8, 8]));
    const after = store.getMasteryScore("apple");

    expect(after).toBeGreaterThan(before);
  });

  it("同档基线变化后其他词的抽词优先级随之刷新", () => {
    const data = (word: string, correct: number, times: number[]): WordData =>
      makeWordData({
        word,
        id: `id-${word}`,
        correctCount: correct,
        totalAttempts: 8,
        inputTimes: times,
        attemptHistory: [
          ...Array(correct).fill(true),
          ...Array(8 - correct).fill(false),
        ],
        correctPracticeDates: ["2026-08-12", "2026-08-13", "2026-08-14"],
      });
    const weight = (word: string) => {
      const d = store.getWordData(word)!;
      return calculatePriority(
        store.getMasteryScore(word),
        d.lastPracticedAt,
        d.totalAttempts,
        d.attemptHistory,
        d.correctPracticeDates
      );
    };

    store.removeAllWords();
    store.setWordData("apple", data("apple", 8, [4, 4, 4, 4, 4]));
    store.setWordData("grape", data("grape", 4, [2, 2, 2, 2, 2]));

    const randomSpy = spyOn(Math, "random").mockReturnValue(0.5);
    store.getRandomWords(1);

    const appleStale = weight("apple");
    store.setWordData("grape", data("grape", 4, [8, 8, 8, 8, 8]));

    const appleFresh = weight("apple");
    const grapeAfter = weight("grape");
    expect(appleStale).toBeGreaterThan(appleFresh);

    const staleRatio = appleStale / (appleStale + grapeAfter);
    const freshRatio = appleFresh / (appleFresh + grapeAfter);
    randomSpy.mockReturnValue((staleRatio + freshRatio) / 2);
    const picked = store.getRandomWords(1);
    randomSpy.mockRestore();

    expect(picked[0][0]).toBe("grape");
  });

  it("inputTimeBaselineByLengthCategory 每档样本 ≥5 时返回中位数", () => {
    const timed = (word: string, times: number[]) =>
      makeWordData({
        word,
        id: `id-${word}`,
        correctCount: times.length,
        totalAttempts: times.length,
        inputTimes: times,
        attemptHistory: times.map(() => true),
      });

    store.removeAllWords();
    store.setWordData("apple", timed("apple", [2, 2, 3, 10, 4]));
    store.setWordData("pronunciation", timed("pronunciation", [6, 6, 6, 6]));

    const [short, mid, long] = store.inputTimeBaselineByLengthCategory;
    expect(short).toBe(3);
    expect(mid).toBeNull();
    expect(long).toBeNull();
  });

  it("纯答错不重算打字基线", () => {
    const timed = (word: string, times: number[]) =>
      makeWordData({
        word,
        id: `id-${word}`,
        correctCount: times.length,
        totalAttempts: times.length,
        inputTimes: times,
        attemptHistory: times.map(() => true),
      });

    store.removeAllWords();
    store.setWordData("apple", timed("apple", [2, 2, 3, 10, 4]));
    expect(store.inputTimeBaselineByLengthCategory[0]).toBe(3);

    store.recordIncorrectAttempt("apple");
    expect(store.inputTimeBaselineByLengthCategory[0]).toBe(3);
  });

  it("新增计时样本后按档重算基线", () => {
    const timed = (word: string, times: number[]) =>
      makeWordData({
        word,
        id: `id-${word}`,
        correctCount: 0,
        totalAttempts: 0,
        inputTimes: times,
        attemptHistory: [],
      });

    store.removeAllWords();
    store.setWordData("apple", timed("apple", [2, 2, 4, 4, 8]));
    expect(store.inputTimeBaselineByLengthCategory[0]).toBe(4);

    for (let i = 0; i < 5; i++) {
      store.recordCorrectAttempt("apple", 10);
    }
    expect(store.inputTimeBaselineByLengthCategory[0]).toBe(9);
  });

  it("同一会话内抽词优先级随时间推进刷新", () => {
    const now = new Date("2026-08-20T12:00:00");
    setSystemTime(now);
    try {
      store.removeAllWords();
      store.setWordData(
        "apple",
        makeWordData({
          word: "apple",
          correctCount: 5,
          totalAttempts: 5,
          attemptHistory: [true, true, true, true, false],
          correctPracticeDates: [],
          lastPracticedAt: now,
        })
      );

      const before = store.getWordPriority("apple");
      setSystemTime(new Date("2026-08-24T12:00:00"));
      const after = store.getWordPriority("apple");

      expect(after).toBeGreaterThan(before);
    } finally {
      setSystemTime();
    }
  });
});

describe("isWordDataEqual", () => {
  it("内容相同返回 true", () => {
    const a = makeWordData({ inputTimes: [1, 2], correctPracticeDates: ["2026-01-01"] });
    const b = makeWordData({ inputTimes: [1, 2], correctPracticeDates: ["2026-01-01"] });
    expect(isWordDataEqual(a, b)).toBe(true);
  });

  it.each([
    ["translation", { translation: "不同" }],
    ["correctCount", { correctCount: 1 }],
    ["totalAttempts", { totalAttempts: 1 }],
    ["inputTimes", { inputTimes: [9] }],
    ["correctPracticeDates", { correctPracticeDates: ["2026-01-02"] }],
    ["attemptHistory", { attemptHistory: [false] }],
    ["lastPracticedAt", { lastPracticedAt: new Date() }],
  ] as Array<[string, Partial<WordData>]>)("%s 不同返回 false", (_field: string, overrides: Partial<WordData>) => {
    expect(isWordDataEqual(makeWordData(), makeWordData(overrides))).toBe(false);
  });
});

describe("isSyncableDataEqual", () => {
  it("缺失数组字段按空数组比较", () => {
    const base = { correctCount: 1, totalAttempts: 1, inputTimes: [1] };
    expect(isSyncableDataEqual(base, { ...base })).toBe(true);
    expect(
      isSyncableDataEqual(base, {
        ...base,
        correctPracticeDates: ["2026-01-01"],
      })
    ).toBe(false);
  });
});

describe("isQueueItemStale", () => {
  const queued = { correctCount: 2, totalAttempts: 3, inputTimes: [1, 2] };

  it("远端尝试次数更多时视为已被覆盖", () => {
    expect(
      isQueueItemStale(
        { ...queued, totalAttempts: 4, correctCount: 3, inputTimes: [1, 2, 3] },
        queued
      )
    ).toBe(true);
  });

  it("本地尝试次数更多时不清理队列", () => {
    expect(isQueueItemStale(queued, { ...queued, totalAttempts: 4 })).toBe(
      false
    );
  });

  it("计数与数组完全一致时视为已同步", () => {
    expect(isQueueItemStale({ ...queued }, queued)).toBe(true);
  });

  it("同尝试次数下远端正确数更高时视为已被覆盖", () => {
    expect(
      isQueueItemStale(
        { ...queued, correctCount: 3 },
        { ...queued, correctCount: 1, attemptHistory: [true, false, false] }
      )
    ).toBe(true);
  });

  it("远端尝试更多但正确更少时保留队列", () => {
    expect(
      isQueueItemStale(
        {
          ...queued,
          totalAttempts: 4,
          correctCount: 1,
          inputTimes: [1, 2, 3, 4],
        },
        queued
      )
    ).toBe(false);
  });

  it("计数相同但数组不同时保留队列避免丢数据", () => {
    expect(
      isQueueItemStale(
        { ...queued, correctPracticeDates: ["2026-01-01"] },
        { ...queued, correctPracticeDates: ["2026-01-01", "2026-01-02"] }
      )
    ).toBe(false);
  });
});

describe("mergeSnapshotIntoStore with pending queue", () => {
  let store: Words;

  const makeSnapshot = (entries: Array<[string, Partial<WordData>]>) => ({
    docs: entries.map(([word, overrides]) => ({
      id: overrides.id ?? `id-${word}`,
      data: () => ({
        word,
        translation: overrides.translation ?? `${word}译`,
        ...overrides,
        createdAt:
          overrides.createdAt ?? { toDate: () => new Date("2026-01-01T00:00:00") },
      }),
    })),
  });

  beforeEach(() => {
    store = new Words();
  });

  it("本地队列较新时保留本地数据", () => {
    mergeSnapshotIntoStore(
      store,
      makeSnapshot([
        ["apple", { correctCount: 2, totalAttempts: 2, inputTimes: [1, 1] }],
      ]),
      [
        {
          wordId: "id-apple",
          data: { correctCount: 3, totalAttempts: 3, inputTimes: [1, 1, 1] },
          practicedAt: 1700000000000,
        },
      ]
    );
    const data = store.getWordData("apple")!;
    expect(data.totalAttempts).toBe(3);
    expect(data.correctCount).toBe(3);
    expect(data.lastPracticedAt?.getTime()).toBe(1700000000000);
  });

  it("远端较新时使用远端数据", () => {
    mergeSnapshotIntoStore(
      store,
      makeSnapshot([
        [
          "apple",
          { correctCount: 4, totalAttempts: 4, inputTimes: [1, 1, 1, 1] },
        ],
      ]),
      [
        {
          wordId: "id-apple",
          data: { correctCount: 3, totalAttempts: 3, inputTimes: [1, 1, 1] },
          practicedAt: 1700000000000,
        },
      ]
    );
    expect(store.getWordData("apple")!.totalAttempts).toBe(4);
  });

  it("远端同次数但正确更多时使用远端数据", () => {
    mergeSnapshotIntoStore(
      store,
      makeSnapshot([
        ["apple", { correctCount: 3, totalAttempts: 3, inputTimes: [1, 1, 1] }],
      ]),
      [
        {
          wordId: "id-apple",
          data: { correctCount: 1, totalAttempts: 3, inputTimes: [1, 1, 1] },
          practicedAt: 1700000000000,
        },
      ]
    );
    expect(store.getWordData("apple")!.correctCount).toBe(3);
  });

  it("计数相同时本地数组优先", () => {
    mergeSnapshotIntoStore(
      store,
      makeSnapshot([
        [
          "apple",
          {
            correctCount: 2,
            totalAttempts: 2,
            correctPracticeDates: ["2026-01-01"],
            attemptHistory: [true, true],
          },
        ],
      ]),
      [
        {
          wordId: "id-apple",
          data: {
            correctCount: 2,
            totalAttempts: 2,
            inputTimes: [],
            correctPracticeDates: ["2026-01-01", "2026-01-02"],
            attemptHistory: [true, false],
          },
          practicedAt: 1700000000000,
        },
      ]
    );
    const data = store.getWordData("apple")!;
    expect(data.correctPracticeDates).toEqual(["2026-01-01", "2026-01-02"]);
    expect(data.attemptHistory).toEqual([true, false]);
  });

  it("byId 返回未叠加队列的 Firestore 原始数据", () => {
    const result = mergeSnapshotIntoStore(
      store,
      makeSnapshot([
        ["apple", { correctCount: 1, totalAttempts: 1, inputTimes: [1] }],
      ]),
      [
        {
          wordId: "id-apple",
          data: { correctCount: 2, totalAttempts: 2, inputTimes: [1, 1] },
          practicedAt: 1700000000000,
        },
      ]
    );
    expect(result.byId.get("id-apple")!.totalAttempts).toBe(1);
    expect(result.byWord.get("apple")!.totalAttempts).toBe(2);
  });

  it("每份文档只解析一次", () => {
    let calls = 0;
    const snapshot = {
      docs: ["apple", "banana"].map((word) => ({
        id: `id-${word}`,
        data: () => {
          calls += 1;
          return {
            word,
            translation: `${word}译`,
            createdAt: { toDate: () => new Date("2026-01-01") },
          };
        },
      })),
    };
    mergeSnapshotIntoStore(store, snapshot);
    expect(calls).toBe(2);
  });

  it("队列中没有对应文档的词不影响合并", () => {
    mergeSnapshotIntoStore(store, makeSnapshot([["apple", {}]]), [
      {
        wordId: "id-ghost",
        data: { correctCount: 1, totalAttempts: 1, inputTimes: [] },
        practicedAt: 1,
      },
    ]);
    expect(store.wordCount).toBe(1);
    expect(store.getWordData("apple")!.totalAttempts).toBe(0);
  });
});

describe("mergeSnapshotIntoStore", () => {
  let store: Words;

  const makeSnapshot = (entries: Array<[string, Partial<WordData>]>) => ({
    docs: entries.map(([word, overrides]) => ({
      id: overrides.id ?? `id-${word}`,
      data: () => ({
        word,
        translation: overrides.translation ?? `${word}译`,
        ...overrides,
        createdAt: overrides.createdAt ?? { toDate: () => new Date("2026-01-01T00:00:00") },
      }),
    })),
  });

  beforeEach(() => {
    store = new Words();
  });

  it("新增快照中的单词", () => {
    mergeSnapshotIntoStore(store, makeSnapshot([["apple", {}]]));
    expect(store.hasWord("apple")).toBe(true);
    expect(store.getTranslation("apple")).toBe("apple译");
  });

  it("删除快照中不存在的单词", () => {
    store.setWordData("apple", makeWordData({ translation: "苹果" }));
    mergeSnapshotIntoStore(store, { docs: [] });
    expect(store.wordCount).toBe(0);
  });

  it("数据未变化时保留原对象引用", () => {
    mergeSnapshotIntoStore(store, makeSnapshot([["apple", { correctCount: 2 }]]));
    const before = store.getWordData("apple")!;
    mergeSnapshotIntoStore(store, makeSnapshot([["apple", { correctCount: 2 }]]));
    expect(store.getWordData("apple")).toBe(before);
  });

  it("数据变化时替换对象引用", () => {
    mergeSnapshotIntoStore(store, makeSnapshot([["apple", { correctCount: 2 }]]));
    const before = store.getWordData("apple")!;
    mergeSnapshotIntoStore(store, makeSnapshot([["apple", { correctCount: 3 }]]));
    const after = store.getWordData("apple")!;
    expect(after).not.toBe(before);
    expect(after.correctCount).toBe(3);
  });

  it("增量合并后熟练度缓存随之更新", () => {
    mergeSnapshotIntoStore(store, makeSnapshot([["apple", {}]]));
    const before = store.getMasteryScore("apple");
    mergeSnapshotIntoStore(
      store,
      makeSnapshot([["apple", { correctCount: 5, totalAttempts: 5, inputTimes: [1, 1, 1, 1, 1] }]])
    );
    expect(store.getMasteryScore("apple")).toBeGreaterThan(before);
  });
});

describe("mergeWordData", () => {
  it("累加计数、合并数组并保留时间边界", () => {
    const target = makeWordData({
      correctCount: 1,
      totalAttempts: 3,
      inputTimes: [1, 2],
      correctPracticeDates: ["2026-01-01"],
      attemptHistory: [true, false, false],
      lastPracticedAt: new Date("2026-01-01T00:00:00"),
      createdAt: new Date("2025-12-01T00:00:00"),
    });
    const source = makeWordData({
      correctCount: 2,
      totalAttempts: 2,
      inputTimes: [3],
      correctPracticeDates: ["2026-01-02", "2026-01-01"],
      attemptHistory: [true, true],
      lastPracticedAt: new Date("2026-01-03T00:00:00"),
      createdAt: new Date("2026-01-02T00:00:00"),
    });

    const merged = mergeWordData(target, source);
    expect(merged.correctCount).toBe(3);
    expect(merged.totalAttempts).toBe(5);
    expect(merged.inputTimes).toEqual([1, 2, 3]);
    expect(merged.correctPracticeDates).toEqual(["2026-01-01", "2026-01-02"]);
    expect(merged.attemptHistory).toEqual([true, false, false, true, true]);
    expect(merged.lastPracticedAt).toEqual(new Date("2026-01-03T00:00:00"));
    expect(merged.createdAt).toEqual(new Date("2025-12-01T00:00:00"));
  });

  it("数组超过上限时保留最近记录", () => {
    const target = makeWordData({
      inputTimes: Array.from({ length: 15 }, (_, i) => i),
      attemptHistory: Array.from({ length: 20 }, () => false),
      correctPracticeDates: Array.from({ length: 20 }, (_, i) =>
        `2026-01-${String(i + 1).padStart(2, "0")}`
      ),
    });
    const source = makeWordData({
      inputTimes: Array.from({ length: 15 }, (_, i) => 100 + i),
      attemptHistory: Array.from({ length: 20 }, () => true),
      correctPracticeDates: Array.from({ length: 20 }, (_, i) =>
        `2026-02-${String(i + 1).padStart(2, "0")}`
      ),
    });

    const merged = mergeWordData(target, source);
    expect(merged.inputTimes).toHaveLength(Words.MAX_INPUT_TIMES);
    expect(merged.inputTimes[0]).toBe(10);
    expect(merged.inputTimes[merged.inputTimes.length - 1]).toBe(114);
    expect(merged.attemptHistory).toHaveLength(Words.MAX_ATTEMPT_HISTORY);
    expect(merged.attemptHistory[0]).toBe(false);
    expect(merged.correctPracticeDates).toHaveLength(
      Words.MAX_CORRECT_PRACTICE_DATES
    );
    expect(
      merged.correctPracticeDates[merged.correctPracticeDates.length - 1]
    ).toBe("2026-02-20");
  });

  it("只有一侧有练习时间时取有数据的一侧", () => {
    const withoutTime = makeWordData({ lastPracticedAt: null });
    const withTime = makeWordData({
      lastPracticedAt: new Date("2026-02-01T00:00:00"),
    });
    expect(mergeWordData(withoutTime, withTime).lastPracticedAt).toEqual(
      new Date("2026-02-01T00:00:00")
    );
    expect(mergeWordData(withTime, withoutTime).lastPracticedAt).toEqual(
      new Date("2026-02-01T00:00:00")
    );
  });

  it("保留目标词的释义与 id", () => {
    const target = makeWordData({ translation: "存在", id: "id-exist" });
    const source = makeWordData({ translation: "存在（过去式）", id: "id-existed" });
    const merged = mergeWordData(target, source);
    expect(merged.translation).toBe("存在");
    expect(merged.id).toBe("id-exist");
  });
});

describe("moveWord", () => {
  it("重命名后旧 key 删除、新 key 保留练习数据并清理输入缓存", () => {
    const store = new Words();
    store.setWordData(
      "attackers",
      makeWordData({ word: "attackers", translation: "攻击者", id: "id-1" })
    );
    store.recordCorrectAttempt("attackers", 1);
    store.setUserInput("attackers", "att");

    const data = store.getWordData("attackers")!;
    store.moveWord("attackers", "attacker", { ...data, word: "attacker" });

    expect(store.hasWord("attackers")).toBe(false);
    expect(store.getUserInput("attackers")).toBe("");
    expect(store.getWordData("attacker")?.correctCount).toBe(1);
    expect(store.getWordId("attacker")).toBe("id-1");
  });
});

describe("resetPracticeRecords", () => {
  it("清空练习字段、失效缓存并返回全部文档", () => {
    const store = new Words();
    store.setWordData("apple", makeWordData());
    store.recordCorrectAttempt("apple", 2);
    store.setUserInput("apple", "app");
    const before = store.getMasteryScore("apple");

    const resetDocs = store.resetPracticeRecords();

    const data = store.getWordData("apple")!;
    expect(data.correctCount).toBe(0);
    expect(data.totalAttempts).toBe(0);
    expect(data.inputTimes).toEqual([]);
    expect(data.lastPracticedAt).toBeNull();
    expect(data.correctPracticeDates).toEqual([]);
    expect(data.attemptHistory).toEqual([]);
    expect(store.getMasteryScore("apple")).not.toBe(before);
    expect(resetDocs.map((doc) => doc.id)).toEqual(["id-apple"]);
    expect(store.getUserInput("apple")).toBe("app");
  });
});
