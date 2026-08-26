import { describe, it, expect } from "bun:test";
import {
  buildRegenerateMessages,
  parseRegenerateResults,
  MAX_SENSES,
} from "./regenerateDefinitions";

describe("buildRegenerateMessages", () => {
  it("构造 system 与 user 消息，包含全部单词", () => {
    const messages = buildRegenerateMessages(["apple", "banana"]);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("apple, banana");
  });
});

describe("parseRegenerateResults", () => {
  const requested = ["apple", "banana", "notaword"];

  it("解析有效义项并保留顺序，缺失词 senses 为 null", () => {
    const result = parseRegenerateResults(
      {
        results: [
          {
            word: "apple",
            senses: [
              { pos: "n.", chinese: "苹果", english: "a round fruit" },
            ],
          },
          { word: "banana", senses: null },
        ],
      },
      requested
    );
    expect(result).toEqual([
      { word: "apple", senses: [{ pos: "n.", chinese: "苹果", english: "a round fruit" }] },
      { word: "banana", senses: null },
      { word: "notaword", senses: null },
    ]);
  });

  it("过滤非法义项与非法词条", () => {
    const result = parseRegenerateResults(
      {
        results: [
          { word: "apple", senses: [{ pos: "", chinese: "苹果", english: "" }] },
          { word: "  APPLE  ", senses: [{ pos: "n.", chinese: "苹果", english: "a round fruit" }] },
        ],
      },
      ["apple"]
    );
    expect(result).toEqual([
      { word: "apple", senses: [{ pos: "n.", chinese: "苹果", english: "a round fruit" }] },
    ]);
  });

  it("超长义项被过滤，空数组视为 null", () => {
    const result = parseRegenerateResults(
      {
        results: [
          { word: "apple", senses: [] },
          {
            word: "banana",
            senses: [{ pos: "n.", chinese: "x".repeat(51), english: "y".repeat(151) }],
          },
        ],
      },
      ["apple", "banana"]
    );
    expect(result).toEqual([
      { word: "apple", senses: null },
      { word: "banana", senses: null },
    ]);
  });

  it("截断到 MAX_SENSES 个义项", () => {
    const senses = Array.from({ length: MAX_SENSES + 2 }, (_, i) => ({
      pos: "n.",
      chinese: `义项${i}`,
      english: `sense ${i}`,
    }));
    const result = parseRegenerateResults({ results: [{ word: "apple", senses }] }, ["apple"]);
    expect(result[0].senses).toHaveLength(MAX_SENSES);
  });

  it("非对象或缺失 results 时全部为 null", () => {
    expect(parseRegenerateResults(null, requested).every((r) => r.senses === null)).toBe(true);
    expect(parseRegenerateResults({ foo: 1 }, requested).every((r) => r.senses === null)).toBe(true);
  });
});
