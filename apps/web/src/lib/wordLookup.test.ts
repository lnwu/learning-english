import { describe, it, expect } from "bun:test";
import { DeepSeekError } from "./deepseek";
import { buildWordLookupMessages, parseWordLookupResult } from "./wordLookup";

describe("buildWordLookupMessages", () => {
  it("system 提示词包含 JSON 契约，user 消息是单词本身", () => {
    const messages = buildWordLookupMessages("running");

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("isWord");
    expect(messages[0].content).toContain("lemma");
    expect(messages[1]).toEqual({ role: "user", content: "running" });
  });
});

describe("parseWordLookupResult", () => {
  it("有效单词返回清洗后的 lemma 与义项", () => {
    const result = parseWordLookupResult(
      {
        isWord: true,
        lemma: "Run",
        senses: [{ pos: "v.", chinese: "跑", english: "to move quickly" }],
      },
      "running",
    );

    expect(result).toEqual({
      lemma: "run",
      senses: [{ pos: "v.", chinese: "跑", english: "to move quickly" }],
    });
  });

  it("非单词返回 senses: null 并回退 lemma", () => {
    expect(parseWordLookupResult({ isWord: false, lemma: "asdf" }, "asdf")).toEqual({
      lemma: "asdf",
      senses: null,
    });
  });

  it("lemma 非法时回退原词", () => {
    const result = parseWordLookupResult(
      {
        isWord: true,
        lemma: "not a word!",
        senses: [{ pos: "n.", chinese: "词", english: "a word" }],
      },
      "word",
    );

    expect(result.lemma).toBe("word");
  });

  it("义项全部非法时抛出 502", () => {
    expect(() =>
      parseWordLookupResult(
        { isWord: true, lemma: "word", senses: [{ pos: "", chinese: "" }] },
        "word",
      ),
    ).toThrow(DeepSeekError);
  });
});
