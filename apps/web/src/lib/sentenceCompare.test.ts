import { describe, it, expect } from "bun:test";
import {
  normalizeForComparison,
  resolveUsedWords,
  sanitizeUsedWords,
} from "./sentenceCompare";

describe("normalizeForComparison", () => {
  it("忽略大小写", () => {
    expect(normalizeForComparison("Hello")).toBe("hello");
  });

  it("忽略标点", () => {
    expect(normalizeForComparison("Hello, world!")).toBe("hello world");
  });

  it("合并多余空白", () => {
    expect(normalizeForComparison("hello   world")).toBe("hello world");
    expect(normalizeForComparison("  hello world  ")).toBe("hello world");
  });

  it("保留中文字符", () => {
    expect(normalizeForComparison("Hello 世界")).toBe("hello 世界");
  });

  it("完全相同的句子归一化后相等", () => {
    const a = normalizeForComparison("I love apple!");
    const b = normalizeForComparison("  i LOVE apple ");
    expect(a).toBe(b);
  });
});

describe("resolveUsedWords", () => {
  it("返回句子中实际出现的目标词", () => {
    expect(
      resolveUsedWords("I ate an apple and a banana.", [
        "apple",
        "banana",
        "cherry",
      ])
    ).toEqual(["apple", "banana"]);
  });

  it("大小写和标点不影响匹配", () => {
    expect(resolveUsedWords("APPLE!", ["apple"])).toEqual(["apple"]);
  });

  it("只匹配完整单词而非子串", () => {
    expect(resolveUsedWords("pineapples", ["apple"])).toEqual([]);
  });
});

describe("sanitizeUsedWords", () => {
  it("过滤模型返回的非目标词", () => {
    expect(sanitizeUsedWords(["apple", "cherry"], ["apple", "banana"])).toEqual(
      ["apple"]
    );
  });

  it("大小写与空白归一化", () => {
    expect(
      sanitizeUsedWords([" Apple ", "BANANA"], ["apple", "banana"])
    ).toEqual(["apple", "banana"]);
  });

  it("非数组回退为全部目标词", () => {
    expect(sanitizeUsedWords(null, ["apple", "banana"])).toEqual([
      "apple",
      "banana",
    ]);
  });

  it("模型未包含任何目标词时返回空数组", () => {
    expect(sanitizeUsedWords(["other words"], ["apple"])).toEqual([]);
  });
});
