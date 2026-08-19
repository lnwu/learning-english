import { describe, it, expect } from "vitest";
import { parseTranslation } from "./parseTranslation";

describe("parseTranslation", () => {
  it("空字符串返回空", () => {
    expect(parseTranslation("")).toEqual({
      englishDefinition: "",
      chineseTranslation: "",
    });
    expect(parseTranslation("  \n  ")).toEqual({
      englishDefinition: "",
      chineseTranslation: "",
    });
  });

  it("单行中文作为中文翻译", () => {
    expect(parseTranslation("苹果")).toEqual({
      englishDefinition: "",
      chineseTranslation: "苹果",
    });
  });

  it("单行英文作为英文释义", () => {
    expect(parseTranslation("a round fruit")).toEqual({
      englishDefinition: "a round fruit",
      chineseTranslation: "",
    });
  });

  it("多行时首行为英文释义，其余为中文翻译", () => {
    expect(parseTranslation("a round fruit\n苹果")).toEqual({
      englishDefinition: "a round fruit",
      chineseTranslation: "苹果",
    });
  });

  it("中文翻译多行时合并保留换行", () => {
    expect(parseTranslation("a round fruit\n苹果\n一种水果")).toEqual({
      englishDefinition: "a round fruit",
      chineseTranslation: "苹果\n一种水果",
    });
  });

  it("去除多余空白", () => {
    expect(parseTranslation("  a round fruit \n 苹果 ")).toEqual({
      englishDefinition: "a round fruit",
      chineseTranslation: "苹果",
    });
  });
});
