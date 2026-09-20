import { describe, it, expect } from "bun:test";
import {
  buildNormalizeMessages,
  parseNormalizeResults,
} from "./normalizeWords";

describe("buildNormalizeMessages", () => {
  it("system 提示包含原形规则与 JSON 结构", () => {
    const messages = buildNormalizeMessages(["attackers", "existed"]);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("lemma");
    expect(messages[0].content).toContain("excited");
    expect(messages[1]).toEqual({
      role: "user",
      content: "attackers, existed",
    });
  });
});

describe("parseNormalizeResults", () => {
  it("按请求顺序返回结果", () => {
    const results = parseNormalizeResults(
      {
        results: [
          { word: "existed", lemma: "exist" },
          { word: "attackers", lemma: "attacker" },
        ],
      },
      ["attackers", "existed"]
    );
    expect(results).toEqual([
      { word: "attackers", lemma: "attacker" },
      { word: "existed", lemma: "exist" },
    ]);
  });

  it("模型漏项时原词作为原形", () => {
    const results = parseNormalizeResults(
      { results: [{ word: "attackers", lemma: "attacker" }] },
      ["attackers", "existed"]
    );
    expect(results[1]).toEqual({ word: "existed", lemma: "existed" });
  });

  it("非法原形回退原词", () => {
    const results = parseNormalizeResults(
      { results: [{ word: "existed", lemma: "not valid!" }] },
      ["existed"]
    );
    expect(results).toEqual([{ word: "existed", lemma: "existed" }]);
  });

  it("大小写与空格做规范化", () => {
    const results = parseNormalizeResults(
      { results: [{ word: " Existed ", lemma: " Exist " }] },
      ["existed"]
    );
    expect(results).toEqual([{ word: "existed", lemma: "exist" }]);
  });

  it("响应格式非法时全部回退原词", () => {
    expect(parseNormalizeResults(null, ["existed"])).toEqual([
      { word: "existed", lemma: "existed" },
    ]);
    expect(parseNormalizeResults({ results: "bad" }, ["existed"])).toEqual([
      { word: "existed", lemma: "existed" },
    ]);
  });
});
