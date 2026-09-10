import { describe, it, expect } from "bun:test";
import { MAX_SENSES, sanitizeWordSenses } from "./senses";

describe("sanitizeWordSenses", () => {
  it("截断到 MAX_SENSES 个义项", () => {
    const senses = sanitizeWordSenses(
      Array.from({ length: MAX_SENSES + 2 }, (_, index) => ({
        pos: "n.",
        chinese: `义项${index}`,
        english: `sense ${index}`,
      }))
    );
    expect(senses).toHaveLength(MAX_SENSES);
  });

  it("过滤缺失字段或超长的义项", () => {
    const senses = sanitizeWordSenses([
      { pos: "n.", chinese: "苹果", english: "a fruit" },
      { pos: "", chinese: "苹果", english: "a fruit" },
      { pos: "n.", chinese: "", english: "a fruit" },
      { pos: "n.", chinese: "苹果", english: "x".repeat(200) },
    ]);
    expect(senses).toEqual([
      { pos: "n.", chinese: "苹果", english: "a fruit" },
    ]);
  });

  it("非数组输入返回空数组", () => {
    expect(sanitizeWordSenses(null)).toEqual([]);
    expect(sanitizeWordSenses("bad")).toEqual([]);
  });
});
