import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { WordsLedger } from "./wordsLedger";
import { Words, type WordData } from "./wordsStore";
import {
  createMemoryQueueStorage,
  createNoopQueueStorage,
  type QueueStorage,
  type SyncQueueItem,
} from "./queueStorage";
import { formatLocalPracticeDate } from "./practiceDate";
import type { WordDocSnapshot, WordOperation, WordsRepo } from "./wordsRepo";

class FakeRepo implements WordsRepo {
  readonly userId = "user-1";
  readonly batchLimit = 500;
  readonly operations: WordOperation[][] = [];
  readonly added: Array<{ word: string; translation: string }> = [];
  readonly deleted: string[] = [];
  failure: { code: string } | null = null;
  private handlers: {
    onDocs: (docs: WordDocSnapshot[]) => void;
    onError: (error: unknown) => void;
  } | null = null;

  subscribeWords(handlers: {
    onDocs: (docs: WordDocSnapshot[]) => void;
    onError: (error: unknown) => void;
  }) {
    this.handlers = handlers;
    return () => {
      this.handlers = null;
    };
  }

  async addWord(word: string, translation: string) {
    this.added.push({ word, translation });
  }

  async deleteWord(wordId: string) {
    this.deleted.push(wordId);
  }

  async commitWordOperations(operations: WordOperation[]) {
    if (this.failure) throw this.failure;
    this.operations.push(operations);
  }

  async loadPracticeTime() {
    return new Map<string, number>();
  }

  async addPracticeTime() {}

  emit(docs: WordDocSnapshot[]) {
    this.handlers?.onDocs(docs);
  }
}

const makeDoc = (
  word: string,
  overrides: Record<string, unknown> = {}
): WordDocSnapshot => ({
  id: `id-${word}`,
  data: () => ({
    word,
    translation: `${word}译`,
    correctCount: 0,
    totalAttempts: 0,
    inputTimes: [],
    lastPracticedAt: null,
    correctPracticeDates: [],
    attemptHistory: [],
    createdAt: { toDate: () => new Date("2026-01-01T00:00:00") },
    ...overrides,
  }),
});

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

const makeQueueItem = (
  wordId: string,
  word: string,
  overrides: Partial<SyncQueueItem> = {}
): SyncQueueItem => ({
  id: `q-${wordId}`,
  type: "attempt",
  word,
  wordId,
  data: { correctCount: 1, totalAttempts: 1, inputTimes: [1] },
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

const setup = () => {
  const repo = new FakeRepo();
  const queue = createMemoryQueueStorage();
  const words = new Words();
  const ledger = new WordsLedger({ words, repo, queue });
  ledger.start();
  return { repo, queue, words, ledger };
};

let errorSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("WordsLedger 记分与快照", () => {
  it("答对后立即入队并刷新待同步计数", () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    expect(ledger.getStatus().loading).toBe(false);

    ledger.recordCorrectAttempt("apple", 2.5);

    expect(ledger.getStatus().pendingCount).toBe(1);
    expect(queue.get("id-apple")!.data).toEqual({
      correctCount: 1,
      totalAttempts: 1,
      inputTimes: [2.5],
      correctPracticeDates: [formatLocalPracticeDate(new Date())],
      attemptHistory: [true],
    });
  });

  it("答错只累计总次数的队列数据", () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);

    ledger.recordIncorrectAttempt("apple");

    expect(queue.get("id-apple")!.data).toEqual({
      correctCount: 0,
      totalAttempts: 1,
      inputTimes: [],
      correctPracticeDates: [],
      attemptHistory: [false],
    });
  });

  it("快照落后于本地队列时保留本地练习数据", () => {
    const { repo, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordCorrectAttempt("apple", 1);
    ledger.recordCorrectAttempt("apple", 1);

    repo.emit([makeDoc("apple", { correctCount: 0, totalAttempts: 0 })]);

    expect(words.getWordData("apple")!.totalAttempts).toBe(2);
    expect(ledger.getStatus().pendingCount).toBe(1);
  });

  it("远端已包含练习时清理过期队列条目", () => {
    const { repo, queue, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordCorrectAttempt("apple", 1);

    repo.emit([
      makeDoc("apple", {
        correctCount: 3,
        totalAttempts: 3,
        inputTimes: [1, 1, 1],
      }),
    ]);

    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().pendingCount).toBe(0);
    expect(words.getWordData("apple")!.totalAttempts).toBe(3);
  });

  it("订阅者在状态变化时收到通知，取消订阅后不再收到", () => {
    const { repo, ledger } = setup();
    let notifications = 0;
    const unsubscribe = ledger.subscribe(() => {
      notifications += 1;
    });

    repo.emit([makeDoc("apple")]);
    expect(notifications).toBeGreaterThan(0);

    unsubscribe();
    const before = notifications;
    ledger.recordCorrectAttempt("apple", 1);
    expect(notifications).toBe(before);
  });

  it("未登录时清空词库、计数归零且状态不再是加载中", () => {
    const words = new Words();
    words.setWordData("apple", makeWordData());
    const ledger = new WordsLedger({
      words,
      repo: null,
      queue: createNoopQueueStorage(),
    });

    ledger.start();

    expect(words.wordCount).toBe(0);
    expect(ledger.getStatus().loading).toBe(false);
    expect(ledger.getStatus().pendingCount).toBe(0);
  });
});

describe("WordsLedger 同步", () => {
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("提交练习字段后出队，lastPracticedAt 取队列时间戳", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordCorrectAttempt("apple", 2);
    const queued = queue.get("id-apple")!;

    await ledger.sync();

    expect(repo.operations).toHaveLength(1);
    const operation = repo.operations[0][0];
    expect(operation.type).toBe("update");
    if (operation.type !== "update") throw new Error("expected update");
    expect(operation.wordId).toBe("id-apple");
    expect(operation.fields.correctCount).toBe(1);
    expect(
      (operation.fields.lastPracticedAt as Date).getTime()
    ).toBe(queued.timestamp);
    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().pendingCount).toBe(0);
  });

  it("并发触发时只执行一次同步", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordCorrectAttempt("apple", 1);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let commits = 0;
    repo.commitWordOperations = async () => {
      commits += 1;
      await gate;
    };

    const first = ledger.sync();
    const second = ledger.sync();
    release();
    await Promise.all([first, second]);

    expect(commits).toBe(1);
    expect(queue.load()).toHaveLength(0);
  });

  it("同一批持续失败时重试到上限后丢弃并计数一次", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordCorrectAttempt("apple", 1);
    repo.failure = { code: "unavailable" };

    await ledger.sync();
    expect(queue.get("id-apple")!.retryCount).toBe(1);
    expect(ledger.getStatus().pendingCount).toBe(1);
    expect(ledger.getStatus().dataLostCount).toBe(0);

    await ledger.sync();
    await ledger.sync();

    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().dataLostCount).toBe(1);
  });

  it("词已删除时按 not-found 直接出队且不计数据丢失", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    queue.save(makeQueueItem("id-ghost", "ghost"));
    repo.failure = { code: "not-found" };

    await ledger.sync();

    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().dataLostCount).toBe(0);
  });

  it("未登录时同步为 no-op", async () => {
    const ledger = new WordsLedger({
      words: new Words(),
      repo: null,
      queue: createNoopQueueStorage(),
    });

    await ledger.sync();

    expect(ledger.getStatus().syncing).toBe(false);
  });

  it("队列为空时不触发提交", async () => {
    const { repo, ledger } = setup();
    repo.emit([makeDoc("apple")]);

    await ledger.sync();

    expect(repo.operations).toHaveLength(0);
  });
});

describe("WordsLedger 存储回退", () => {
  it("队列存储回退内存时标记 storageFailed", () => {
    const repo = new FakeRepo();
    let fallback = false;
    const queue: QueueStorage = {
      load: () => [],
      get: () => null,
      save: () => {
        fallback = true;
      },
      removeByIds: () => {},
      clear: () => {},
      get usingMemoryFallback() {
        return fallback;
      },
    };
    const ledger = new WordsLedger({ words: new Words(), repo, queue });
    ledger.start();
    repo.emit([makeDoc("apple")]);

    ledger.recordCorrectAttempt("apple", 1);

    expect(ledger.getStatus().storageFailed).toBe(true);
  });
});

describe("WordsLedger 词库命令", () => {
  it("删除单词时清理其队列条目并刷新计数", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordCorrectAttempt("apple", 1);

    await ledger.deleteWord("apple");

    expect(repo.deleted).toEqual(["id-apple"]);
    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().pendingCount).toBe(0);
  });

  it("更新释义先改内存再写库", async () => {
    const { repo, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);

    await ledger.updateTranslations([{ word: "apple", translation: "苹果" }]);

    expect(words.getTranslation("apple")).toBe("苹果");
    expect(repo.operations[0]).toEqual([
      { type: "update", wordId: "id-apple", fields: { translation: "苹果" } },
    ]);
  });

  it("归一化时把屈折形式合并进已有原形", async () => {
    const { repo, words, ledger } = setup();
    repo.emit([
      makeDoc("apple", { correctCount: 1, totalAttempts: 1, inputTimes: [1] }),
      makeDoc("apples", {
        correctCount: 2,
        totalAttempts: 3,
        inputTimes: [1, 2, 3],
      }),
    ]);

    const result = await ledger.normalizeWordForms([
      { from: "apples", to: "apple" },
    ]);

    expect(result).toEqual({ renamed: 0, merged: 1 });
    expect(words.hasWord("apples")).toBe(false);
    expect(words.getWordData("apple")!.totalAttempts).toBe(4);
    expect(repo.operations.flat().map((operation) => operation.type)).toEqual([
      "update",
      "delete",
    ]);
  });

  it("重置练习记录时清空队列并归零计数", async () => {
    const { repo, queue, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordCorrectAttempt("apple", 2);

    await ledger.resetPracticeRecords();

    expect(words.getWordData("apple")!.totalAttempts).toBe(0);
    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().pendingCount).toBe(0);
    expect(repo.operations[0][0]).toMatchObject({
      type: "update",
      wordId: "id-apple",
    });
  });

  it("未登录时写命令抛出未登录错误", async () => {
    const ledger = new WordsLedger({
      words: new Words(),
      repo: null,
      queue: createNoopQueueStorage(),
    });

    await expect(ledger.addWord("apple", "苹果")).rejects.toThrow();
    await expect(ledger.deleteWord("apple")).rejects.toThrow();
    await expect(ledger.resetPracticeRecords()).rejects.toThrow();
  });
});
