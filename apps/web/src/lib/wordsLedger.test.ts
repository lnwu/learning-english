import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { WordsLedger } from "./wordsLedger";
import { Words, type WordData } from "./wordsStore";
import {
  createMemoryQueueStorage,
  createNoopQueueStorage,
  type QueueStorage,
  type SyncQueueItem,
} from "./queueStorage";
import { initialMemory, initialStats, type WordMemory } from "./masteryModel";
import type { WordSense } from "./wordSenses";
import type { WordDocSnapshot, WordOperation, WordsRepo } from "./wordsRepo";

class FakeRepo implements WordsRepo {
  readonly userId = "user-1";
  readonly batchLimit = 500;
  readonly operations: WordOperation[][] = [];
  readonly added: Array<{ word: string; senses: WordSense[] }> = [];
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

  async addWord(word: string, senses: WordSense[]) {
    this.added.push({ word, senses });
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

const memory = (overrides: Partial<WordMemory> = {}): WordMemory => ({
  ...initialMemory(0),
  ...overrides,
});

const reviewMemoryAt = (at: number, id: string) => ({
  id,
  at,
  g: 3 as const,
  h: false,
  r: null,
  s: 2.3065,
  d: 2.1181,
});

const makeDoc = (word: string, overrides: Record<string, unknown> = {}): WordDocSnapshot => ({
  id: `id-${word}`,
  data: () => ({
    word,
    translation: `${word}译`,
    memory: initialMemory(0),
    stats: initialStats(),
    inputTimes: [],
    reviews: [],
    createdAt: { toDate: () => new Date("2026-01-01T00:00:00") },
    ...overrides,
  }),
});

const makeWordData = (overrides: Partial<WordData> = {}): WordData => ({
  word: "apple",
  translation: "苹果",
  memory: initialMemory(0),
  stats: initialStats(),
  inputTimes: [],
  reviews: [],
  createdAt: new Date("2026-01-01T00:00:00"),
  id: "id-apple",
  ...overrides,
});

const makeQueueItem = (
  wordId: string,
  word: string,
  overrides: Partial<SyncQueueItem> = {},
): SyncQueueItem => ({
  id: `q-${wordId}`,
  type: "attempt",
  word,
  wordId,
  data: {
    memory: memory({ state: "review", stability: 2.3065, lastReviewAt: 1000 }),
    stats: { ...initialStats(), reviewDays: 1 },
    inputTimes: [1],
    reviews: [reviewMemoryAt(1000, "r1")],
  },
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

    ledger.recordReview("apple", 3, { inputTimeSeconds: 2.5 });

    expect(ledger.getStatus().pendingCount).toBe(1);
    const queued = queue.get("id-apple")!;
    expect(queued.data.memory.state).toBe("learning");
    expect(queued.data.stats.reviewDays).toBe(1);
    expect(queued.data.stats.dailyReviews).toBe(1);
    expect(queued.data.inputTimes).toEqual([2.5]);
    expect(queued.data.reviews).toHaveLength(1);
    expect(queued.data.reviews[0]).toMatchObject({ g: 3, h: false, r: null });
  });

  it("答错写入答错评级并累计复习日", () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);

    ledger.recordReview("apple", 1);

    const queued = queue.get("id-apple")!;
    expect(queued.data.memory.state).toBe("learning");
    expect(queued.data.memory.lastGrade).toBe(1);
    expect(queued.data.inputTimes).toEqual([]);
    expect(queued.data.reviews[0]).toMatchObject({ g: 1, h: false });
  });

  it("快照落后于本地队列时保留本地练习数据", () => {
    const { repo, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordReview("apple", 3, { inputTimeSeconds: 1 });
    const localReviewAt = words.getWordData("apple")!.memory.lastReviewAt;

    repo.emit([makeDoc("apple")]);

    expect(words.getWordData("apple")!.memory.lastReviewAt).toBe(localReviewAt);
    expect(words.getWordData("apple")!.memory.reps).toBe(1);
    expect(ledger.getStatus().pendingCount).toBe(1);
  });

  it("远端已包含复习时清理过期队列条目", () => {
    const { repo, queue, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordReview("apple", 3, { inputTimeSeconds: 1 });

    repo.emit([
      makeDoc("apple", {
        memory: memory({
          state: "review",
          stability: 10,
          difficulty: 5,
          lastReviewAt: Date.now() + 60_000,
          due: Date.now(),
          reps: 5,
        }),
        stats: { ...initialStats(), reviewDays: 5 },
      }),
    ]);

    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().pendingCount).toBe(0);
    expect(words.getWordData("apple")!.memory.reps).toBe(5);
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
    ledger.recordReview("apple", 3, { inputTimeSeconds: 1 });
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

  it("提交记忆状态与复习日志后出队", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordReview("apple", 3, { inputTimeSeconds: 2 });
    const queued = queue.get("id-apple")!;

    await ledger.sync();

    expect(repo.operations).toHaveLength(1);
    const operation = repo.operations[0][0];
    expect(operation.type).toBe("update");
    if (operation.type !== "update") throw new Error("expected update");
    expect(operation.wordId).toBe("id-apple");
    const fields = operation.fields as {
      memory: WordMemory;
      stats: { reviewDays: number };
      inputTimes: number[];
      reviews: unknown[];
    };
    expect(fields.memory.lastReviewAt).toBe(queued.data.memory.lastReviewAt);
    expect(fields.stats.reviewDays).toBe(1);
    expect(fields.inputTimes).toEqual([2]);
    expect(fields.reviews).toHaveLength(1);
    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().pendingCount).toBe(0);
  });

  it("并发触发时只执行一次同步", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordReview("apple", 3, { inputTimeSeconds: 1 });

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
    ledger.recordReview("apple", 3, { inputTimeSeconds: 1 });
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

    ledger.recordReview("apple", 3, { inputTimeSeconds: 1 });

    expect(ledger.getStatus().storageFailed).toBe(true);
  });
});

describe("WordsLedger 词库命令", () => {
  it("删除单词时清理其队列条目并刷新计数", async () => {
    const { repo, queue, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordReview("apple", 3, { inputTimeSeconds: 1 });

    await ledger.deleteWord("apple");

    expect(repo.deleted).toEqual(["id-apple"]);
    expect(queue.load()).toHaveLength(0);
    expect(ledger.getStatus().pendingCount).toBe(0);
  });

  it("更新释义先改内存再写库", async () => {
    const { repo, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);

    await ledger.updateTranslations([
      {
        word: "apple",
        senses: [{ pos: "n.", chinese: "苹果", english: "a round fruit" }],
      },
    ]);

    expect(words.getTranslation("apple")).toBe("n. 苹果 — a round fruit");
    expect(repo.operations[0]).toEqual([
      {
        type: "update",
        wordId: "id-apple",
        fields: { translation: "n. 苹果 — a round fruit" },
      },
    ]);
  });

  it("归一化时把屈折形式合并进已有原形", async () => {
    const { repo, words, ledger } = setup();
    repo.emit([
      makeDoc("apple", {
        memory: memory({ state: "review", stability: 2.3065, lastReviewAt: 1000 }),
        stats: { ...initialStats(), reviewDays: 1 },
        reviews: [reviewMemoryAt(1000, "r1")],
      }),
      makeDoc("apples", {
        memory: memory({ state: "review", stability: 2.3065, lastReviewAt: 2000 }),
        stats: { ...initialStats(), reviewDays: 2 },
        reviews: [reviewMemoryAt(2000, "r2")],
      }),
    ]);

    const result = await ledger.normalizeWordForms([{ from: "apples", to: "apple" }]);

    expect(result).toEqual({ renamed: 0, merged: 1 });
    expect(words.hasWord("apples")).toBe(false);
    expect(words.getWordData("apple")!.reviews).toHaveLength(2);
    expect(repo.operations.flat().map((operation) => operation.type)).toEqual(["update", "delete"]);
  });

  it("重置练习记录时清空队列并回到 new", async () => {
    const { repo, queue, words, ledger } = setup();
    repo.emit([makeDoc("apple")]);
    ledger.recordReview("apple", 3, { inputTimeSeconds: 2 });

    await ledger.resetPracticeRecords();

    expect(words.getWordData("apple")!.memory.state).toBe("new");
    expect(words.getWordData("apple")!.memory.reps).toBe(0);
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

    await expect(
      ledger.addWord("apple", [{ pos: "n.", chinese: "苹果", english: "a round fruit" }]),
    ).rejects.toThrow();
    await expect(ledger.deleteWord("apple")).rejects.toThrow();
    await expect(ledger.resetPracticeRecords()).rejects.toThrow();
  });
});
