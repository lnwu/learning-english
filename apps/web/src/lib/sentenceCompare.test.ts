import { describe, it, expect } from "bun:test";
import { normalizeForComparison } from "./sentenceCompare";

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
