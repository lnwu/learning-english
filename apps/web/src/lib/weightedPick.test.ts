import { describe, it, expect } from "bun:test";
import { pickWeightedRandom } from "./weightedPick";

const items = (spec: Array<[string, number]>) =>
  spec.map(([word, weight]) => ({ word, weight }));

describe("pickWeightedRandom", () => {
  it("空候选返回空数组", () => {
    expect(pickWeightedRandom([], 3, () => 0.5)).toEqual([]);
  });

  it("不超过数量上限且不重复", () => {
    const picked = pickWeightedRandom(
      items([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]),
      2,
      () => 0.5
    );

    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((item) => item.word)).size).toBe(2);
  });

  it("请求数量超过候选数时返回全部", () => {
    const picked = pickWeightedRandom(
      items([
        ["a", 1],
        ["b", 1],
      ]),
      5,
      () => 0.5
    );

    expect(picked).toHaveLength(2);
  });

  it("max 为 0 时返回空数组", () => {
    expect(pickWeightedRandom(items([["a", 1]]), 0, () => 0.5)).toEqual([]);
  });

  it("固定 rng 下按权重命中：高权重更先被抽中", () => {
    const pool = items([
      ["a", 10],
      ["b", 90],
    ]);

    expect(pickWeightedRandom(pool, 1, () => 0.4).map((i) => i.word)).toEqual([
      "b",
    ]);
    expect(pickWeightedRandom(pool, 1, () => 0.05).map((i) => i.word)).toEqual([
      "a",
    ]);
  });
});
