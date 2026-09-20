import { describe, it, expect } from "bun:test";
import { resolveRenamePlan } from "./wordNormalization";

const makeMap = (entries: Array<[string, string]>) => new Map(entries);

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
