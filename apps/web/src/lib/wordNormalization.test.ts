import { describe, it, expect } from "bun:test";
import { buildNormalizeDocPlan, resolveRenamePlan } from "./wordNormalization";
import {
  initialMemory,
  initialStats,
  type ReviewLogEntry,
  type WordMemory,
} from "./masteryModel";
import type { WordData } from "./wordsStore";

const makeMap = (entries: Array<[string, string]>) => new Map(entries);

const memoryAt = (at: number): WordMemory => ({
  ...initialMemory(0),
  stability: 2.3065,
  difficulty: 2.1181,
  state: "review",
  due: at,
  lastReviewAt: at,
  lastGrade: 3,
  reps: 1,
});

const reviewAt = (id: string, at: number): ReviewLogEntry => ({
  id,
  at,
  g: 3,
  h: false,
  r: null,
  s: 2.3065,
  d: 2.1181,
});

const makeWord = (overrides: Partial<WordData> = {}): WordData => ({
  word: "attackers",
  translation: "攻击者",
  memory: memoryAt(1000),
  stats: {
    ...initialStats(),
    reviewDays: 1,
    lastReviewDay: "2026-01-02",
    dailyReviews: 1,
  },
  inputTimes: [1, 2],
  reviews: [reviewAt("r1", 1000)],
  createdAt: new Date("2025-12-01T00:00:00"),
  id: "id-1",
  ...overrides,
});

describe("resolveRenamePlan", () => {
  it("把屈折形式映射到原形", () => {
    const plan = resolveRenamePlan(
      ["attackers", "existed", "apple"],
      makeMap([
        ["attackers", "attacker"],
        ["existed", "exist"],
        ["apple", "apple"],
      ])
    );
    expect(plan).toEqual([
      { from: "attackers", to: "attacker" },
      { from: "existed", to: "exist" },
    ]);
  });

  it("链式映射收敛到最终原形", () => {
    const plan = resolveRenamePlan(
      ["axes", "axis"],
      makeMap([
        ["axes", "axis"],
        ["axis", "axe"],
      ])
    );
    expect(plan).toEqual([
      { from: "axes", to: "axe" },
      { from: "axis", to: "axe" },
    ]);
  });

  it("循环映射不处理", () => {
    const plan = resolveRenamePlan(
      ["a", "b"],
      makeMap([
        ["a", "b"],
        ["b", "a"],
      ])
    );
    expect(plan).toEqual([]);
  });

  it("缺少映射或原形相同的单词跳过", () => {
    const plan = resolveRenamePlan(
      ["apple", "banana"],
      makeMap([["apple", "apple"]])
    );
    expect(plan).toEqual([]);
  });

  it("原形不在词库时仍生成重命名", () => {
    const plan = resolveRenamePlan(["attackers"], makeMap([["attackers", "attacker"]]));
    expect(plan).toEqual([{ from: "attackers", to: "attacker" }]);
  });
});

describe("buildNormalizeDocPlan", () => {
  it("原形不存在时只重命名单词文档", () => {
    const source = makeWord();
    const plan = buildNormalizeDocPlan(
      [{ from: "attackers", to: "attacker" }],
      (word) => (word === "attackers" ? source : undefined)
    );

    expect(plan.renamed).toBe(1);
    expect(plan.merged).toBe(0);
    expect(plan.operations).toEqual([
      { type: "rename", wordId: "id-1", word: "attacker" },
    ]);
    expect(plan.storeUpdates).toEqual([
      { from: "attackers", to: "attacker", data: { ...source, word: "attacker" } },
    ]);
  });

  it("原形已存在时合并记忆状态并删除源文档", () => {
    const source = makeWord();
    const target = makeWord({
      word: "attacker",
      id: "id-2",
      memory: memoryAt(2000),
      stats: {
        reviewDays: 2,
        lastReviewDay: "2026-01-03",
        dailyReviews: 1,
        hints: 1,
      },
      inputTimes: [3],
      reviews: [reviewAt("r2", 2000)],
    });
    const plan = buildNormalizeDocPlan(
      [{ from: "attackers", to: "attacker" }],
      (word) =>
        word === "attackers" ? source : word === "attacker" ? target : undefined
    );

    expect(plan.renamed).toBe(0);
    expect(plan.merged).toBe(1);
    expect(plan.operations).toEqual([
      {
        type: "update",
        wordId: "id-2",
        fields: {
          memory: memoryAt(2000),
          stats: {
            reviewDays: 2,
            lastReviewDay: "2026-01-03",
            dailyReviews: 1,
            hints: 1,
          },
          inputTimes: [3, 1, 2],
          reviews: [reviewAt("r1", 1000), reviewAt("r2", 2000)],
          createdAt: new Date("2025-12-01T00:00:00"),
        },
      },
      { type: "delete", wordId: "id-1" },
    ]);
    expect(plan.storeUpdates[0].data.id).toBe("id-2");
    expect(plan.storeUpdates[0].data.word).toBe("attacker");
  });

  it("源词不在词库时不生成操作", () => {
    const plan = buildNormalizeDocPlan(
      [{ from: "missing", to: "lemma" }],
      () => undefined
    );

    expect(plan.operations).toEqual([]);
    expect(plan.renamed).toBe(0);
    expect(plan.merged).toBe(0);
  });

  it("目标与源是同一文档时跳过", () => {
    const same = makeWord();
    const plan = buildNormalizeDocPlan(
      [{ from: "attackers", to: "attacker" }],
      () => same
    );

    expect(plan.operations).toEqual([]);
    expect(plan.renamed).toBe(0);
    expect(plan.merged).toBe(0);
  });

  it("链式计划按投影视图收敛到最终原形", () => {
    const source = makeWord();
    const plan = buildNormalizeDocPlan(
      [
        { from: "attackers", to: "attacking" },
        { from: "attacking", to: "attacker" },
      ],
      (word) => (word === "attackers" ? source : undefined)
    );

    expect(plan.renamed).toBe(2);
    expect(plan.merged).toBe(0);
    expect(plan.operations).toEqual([
      { type: "rename", wordId: "id-1", word: "attacking" },
      { type: "rename", wordId: "id-1", word: "attacker" },
    ]);
    expect(plan.storeUpdates.at(-1)?.data.word).toBe("attacker");
  });
});
