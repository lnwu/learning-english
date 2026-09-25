import { describe, it, expect } from "bun:test";
import {
  badRequest,
  optionalText,
  parseBody,
  requiredText,
  sentenceWordList,
  wordList,
  wordToken,
  wordTokenList,
  type FieldParser,
} from "./apiInput";

const errorOf = <T>(parser: FieldParser<T>, raw: unknown): string | null => {
  const result = parser(raw);
  return result.ok ? null : result.error;
};

const valueOf = <T>(parser: FieldParser<T>, raw: unknown): T | undefined => {
  const result = parser(raw);
  return result.ok ? result.value : undefined;
};

describe("badRequest", () => {
  it("返回 400 与 error 字段", async () => {
    const response = badRequest("无效单词");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "无效单词" });
  });
});

describe("requiredText", () => {
  const parser = requiredText({ maxLength: 10, message: "缺少内容" });

  it("缺失或纯空白返回自定义文案", () => {
    expect(errorOf(parser, undefined)).toBe("缺少内容");
    expect(errorOf(parser, "")).toBe("缺少内容");
    expect(errorOf(parser, "   ")).toBe("缺少内容");
    expect(errorOf(parser, 5)).toBe("缺少内容");
  });

  it("超长返回统一文案", () => {
    expect(errorOf(parser, "x".repeat(11))).toBe("输入内容过长");
  });

  it("去除首尾空白", () => {
    expect(valueOf(parser, "  hi  ")).toBe("hi");
  });
});

describe("optionalText", () => {
  const parser = optionalText(5);

  it("允许为空", () => {
    expect(valueOf(parser, undefined)).toBe("");
    expect(valueOf(parser, "  ")).toBe("");
  });

  it("超长返回统一文案", () => {
    expect(errorOf(parser, "abcdef")).toBe("输入内容过长");
  });
});

describe("wordToken", () => {
  const parser = wordToken();

  it("去空白并转小写", () => {
    expect(valueOf(parser, " Apple ")).toBe("apple");
  });

  it("非字母、超长或非字符串都返回无效单词", () => {
    expect(errorOf(parser, "ap ple")).toBe("无效单词");
    expect(errorOf(parser, "a".repeat(51))).toBe("无效单词");
    expect(errorOf(parser, 123)).toBe("无效单词");
    expect(errorOf(parser, "")).toBe("无效单词");
  });
});

describe("wordTokenList", () => {
  const parser = wordTokenList({ maxItems: 3 });

  it("非数组或空数组返回无效单词列表", () => {
    expect(errorOf(parser, undefined)).toBe("无效单词列表");
    expect(errorOf(parser, [])).toBe("无效单词列表");
    expect(errorOf(parser, "apple")).toBe("无效单词列表");
  });

  it("超过上限返回单词数量过多", () => {
    expect(errorOf(parser, ["a", "b", "c", "d"])).toBe("单词数量过多");
  });

  it("转小写并去重", () => {
    expect(valueOf(parser, ["A", "a", "B"])).toEqual(["a", "b"]);
  });

  it("全部非法时返回无效单词列表", () => {
    expect(errorOf(parser, ["b!", 5, ""])).toBe("无效单词列表");
  });
});

describe("wordList", () => {
  const parser = wordList({ maxItems: 2, maxItemLength: 4 });

  it("非数组返回空数组", () => {
    expect(valueOf(parser, undefined)).toEqual([]);
  });

  it("过滤非字符串与空值并截断到上限", () => {
    expect(valueOf(parser, [" ab ", 5, "", "cdef", "ghij"])).toEqual([
      "ab",
      "cdef",
    ]);
  });

  it("截断后仍超长返回统一文案", () => {
    expect(errorOf(parser, ["abcdef"])).toBe("输入内容过长");
  });
});

describe("sentenceWordList", () => {
  const parser = sentenceWordList({
    maxItems: 2,
    maxWordLength: 5,
    maxTranslationLength: 4,
  });

  it("非数组返回空数组", () => {
    expect(valueOf(parser, undefined)).toEqual([]);
  });

  it("提取并去空白，丢弃空 word 项", () => {
    expect(
      valueOf(parser, [
        { word: " tree ", translation: " 树 " },
        { word: "", translation: "x" },
        null,
        "bad",
      ])
    ).toEqual([{ word: "tree", translation: "树" }]);
  });

  it("截断到上限", () => {
    expect(
      valueOf(parser, [
        { word: "a", translation: "" },
        { word: "b", translation: "" },
        { word: "c", translation: "" },
      ])
    ).toEqual([
      { word: "a", translation: "" },
      { word: "b", translation: "" },
    ]);
  });

  it("单词或释义超长返回统一文案", () => {
    expect(
      errorOf(parser, [{ word: "abcdef", translation: "" }])
    ).toBe("输入内容过长");
    expect(
      errorOf(parser, [{ word: "a", translation: "五个字以上" }])
    ).toBe("输入内容过长");
  });
});

describe("parseBody", () => {
  const parse = parseBody<{ word: string; note: string }>({
    word: wordToken(),
    note: optionalText(5),
  });

  it("校验通过时返回结构化 body", () => {
    const result = parse({ word: " Apple ", note: " hi " });
    expect(result).toEqual({ ok: true, body: { word: "apple", note: "hi" } });
  });

  it("首个失败字段决定 400 文案", async () => {
    const result = parse({ word: "ap ple" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "无效单词" });
  });

  it("忽略多余字段，null 输入按空对象处理", () => {
    expect(parse({ word: "Apple", note: "", extra: 1 })).toEqual({
      ok: true,
      body: { word: "apple", note: "" },
    });
    const result = parseBody<{ note: string }>({ note: optionalText(5) })(null);
    expect(result).toEqual({ ok: true, body: { note: "" } });
  });
});
