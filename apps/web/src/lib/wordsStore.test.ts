import { describe, it, expect, beforeEach } from "bun:test";
import {
  Words,
  parseWordDoc,
  isWordDataEqual,
  mergeSnapshotIntoStore,
  type WordData,
} from "./wordsStore";
import { formatLocalPracticeDate } from "./practiceDate";

const makeWordData = (overrides: Partial<WordData> = {}): WordData => ({
  word: "apple",
  translation: "苹果",
  correctCount: 0,
  totalAttempts: 0,
  inputTimes: [],
  lastPracticedAt: null,
  correctPracticeDates: [],
  createdAt: new Date("2026-01-01T00:00:00"),
  id: "id-apple",
  ...overrides,
});

describe("Words store", () => {
  let store: Words;

  beforeEach(() => {
    store = new Words();
    store.addWord("apple", "苹果", "id-apple");
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
  });

  it("对不存在的单词记录尝试时静默忽略", () => {
    store.recordCorrectAttempt("ghost");
    store.recordIncorrectAttempt("ghost");
    expect(store.wordData.size).toBe(1);
  });

  it("recordCorrectAttempt 后熟练度缓存失效", () => {
    const before = store.getMasteryScore("apple");
    store.recordCorrectAttempt("apple", 1);
    const after = store.getMasteryScore("apple");
    expect(after).not.toBe(before);
  });

  it("getRandomWords 不重复且不超过上限", () => {
    for (let i = 0; i < 10; i++) {
      store.addWord(`word${i}`, `译${i}`, `id-${i}`);
    }
    const selected = store.getRandomWords(5);
    expect(selected).toHaveLength(5);
    expect(new Set(selected.map(([word]) => word)).size).toBe(5);
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
    store.addWord("banana", "香蕉", "id-banana");
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

  it("averageTimeByLengthCategory 按单词长度分组", () => {
    store.addWord("pronunciation", "发音", "id-pronunciation");
    store.recordCorrectAttempt("apple", 2);
    store.recordCorrectAttempt("pronunciation", 6);
    const [short, mid, long] = store.averageTimeByLengthCategory;
    expect(short).toBe(2);
    expect(mid).toBeNull();
    expect(long).toBe(6);
  });
});

describe("parseWordDoc", () => {
  it("缺失字段使用默认值", () => {
    const data = parseWordDoc("id-1", { word: "apple", translation: "苹果" });
    expect(data.correctCount).toBe(0);
    expect(data.totalAttempts).toBe(0);
    expect(data.inputTimes).toEqual([]);
    expect(data.lastPracticedAt).toBeNull();
    expect(data.correctPracticeDates).toEqual([]);
    expect(data.id).toBe("id-1");
  });

  it("时间戳字段调用 toDate 转换", () => {
    const practiced = new Date("2026-02-01T10:00:00");
    const data = parseWordDoc("id-1", {
      word: "apple",
      translation: "苹果",
      lastPracticedAt: { toDate: () => practiced },
      createdAt: { toDate: () => new Date("2026-01-01") },
    });
    expect(data.lastPracticedAt).toBe(practiced);
  });

  it("correctPracticeDates 统一归一化为本地日期", () => {
    const data = parseWordDoc("id-1", {
      word: "apple",
      translation: "苹果",
      correctPracticeDates: ["2026-01-02", "2026-01-03T12:00:00.000Z"],
    });
    expect(data.correctPracticeDates[0]).toBe("2026-01-02");
    expect(data.correctPracticeDates[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
    ["lastPracticedAt", { lastPracticedAt: new Date() }],
  ] as Array<[string, Partial<WordData>]>)("%s 不同返回 false", (_field: string, overrides: Partial<WordData>) => {
    expect(isWordDataEqual(makeWordData(), makeWordData(overrides))).toBe(false);
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
    expect(store.wordData.has("apple")).toBe(true);
    expect(store.getTranslation("apple")).toBe("apple译");
  });

  it("删除快照中不存在的单词", () => {
    store.addWord("apple", "苹果", "id-apple");
    mergeSnapshotIntoStore(store, { docs: [] });
    expect(store.wordData.size).toBe(0);
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
