import { describe, it, expect } from "bun:test";
import { Words } from "./wordsStore";
import {
  extractWordFromSelection,
  checkWordAddable,
  MAX_ADD_WORD_LENGTH,
} from "./wordSelection";

describe("extractWordFromSelection", () => {
  it("提取普通英文单词并转小写", () => {
    expect(extractWordFromSelection("Hello")).toBe("hello");
    expect(extractWordFromSelection("APPLE")).toBe("apple");
  });

  it("从带标点/引号的选中文本中提取首个英文片段", () => {
    expect(extractWordFromSelection('"world"')).toBe("world");
    expect(extractWordFromSelection("can't")).toBe("can");
    expect(extractWordFromSelection("well-known")).toBe("well");
    expect(extractWordFromSelection("(run) fast")).toBe("run");
  });

  it("返回 null 的情况", () => {
    expect(extractWordFromSelection("")).toBeNull();
    expect(extractWordFromSelection("你好世界")).toBeNull();
    expect(extractWordFromSelection("  ")).toBeNull();
  });

  it("超长文本返回 null", () => {
    expect(extractWordFromSelection("a".repeat(MAX_ADD_WORD_LENGTH + 1))).toBeNull();
  });
});

describe("checkWordAddable", () => {
  it("新单词返回 ok", () => {
    const words = new Words();
    expect(checkWordAddable(words, "hello")).toBe("ok");
  });

  it("已存在返回 exists", () => {
    const words = new Words();
    words.addWord("hello", "你好", "id-1");
    expect(checkWordAddable(words, "hello")).toBe("exists");
  });

  it("包含非法字符或超长返回 invalid", () => {
    const words = new Words();
    expect(checkWordAddable(words, "hello world")).toBe("invalid");
    expect(checkWordAddable(words, "hello!")).toBe("invalid");
    expect(checkWordAddable(words, "hello123")).toBe("invalid");
    expect(checkWordAddable(words, "a".repeat(MAX_ADD_WORD_LENGTH + 1))).toBe("invalid");
  });
});