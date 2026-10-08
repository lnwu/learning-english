import { describe, it, expect } from "bun:test";
import { AiServiceError } from "./aiClient";
import { SENSE_SELECTION_RULE } from "./aiPrompts";
import { buildWordLookupMessages, parseWordLookupResult } from "./wordLookup";
import type { WordSourceCandidate } from "./wordSourceSearch";

const candidate = (overrides: Partial<WordSourceCandidate> = {}): WordSourceCandidate => ({
  kind: "wikipedia",
  url: "https://en.wikipedia.org/?curid=1",
  excerpt: "a mouth is where a river flows into a larger body of water",
  ...overrides,
});

describe("buildWordLookupMessages", () => {
  it("无候选时 user 消息是单词本身，并要求空的 sources", () => {
    const messages = buildWordLookupMessages("running");

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("isWord");
    expect(messages[0].content).toContain("lemma");
    expect(messages[0].content).toContain("sources must be an empty array");
    expect(messages[1]).toEqual({ role: "user", content: "running" });
  });

  it("有候选时列出编号候选", () => {
    const messages = buildWordLookupMessages("mouth", [
      candidate(),
      candidate({ kind: "stackexchange", url: "https://english.stackexchange.com/questions/1" }),
    ]);

    expect(messages[1].content).toContain("Word: mouth");
    expect(messages[1].content).toContain("0. [wikipedia]");
    expect(messages[1].content).toContain("1. [stackexchange]");
  });

  it("共用 aiPrompts 的义项选择约束", () => {
    const content = buildWordLookupMessages("mouth")[0].content;
    expect(content).toContain(SENSE_SELECTION_RULE);
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
      sources: [],
    });
  });

  it("非单词返回 senses: null 并回退 lemma", () => {
    expect(parseWordLookupResult({ isWord: false, lemma: "asdf" }, "asdf")).toEqual({
      lemma: "asdf",
      senses: null,
      sources: [],
    });
  });

  it("isWord 非布尔 true 视为未识别", () => {
    expect(parseWordLookupResult({ isWord: "false", senses: [] }, "asdf")).toEqual({
      lemma: "asdf",
      senses: null,
      sources: [],
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
    ).toThrow(AiServiceError);
  });

  it("按候选编号配对来源", () => {
    const candidates = [
      candidate(),
      candidate({ kind: "stackexchange", url: "https://english.stackexchange.com/questions/1" }),
    ];
    const result = parseWordLookupResult(
      {
        isWord: true,
        lemma: "mouth",
        senses: [
          { pos: "n.", chinese: "嘴", english: "the part of the face" },
          { pos: "n.", chinese: "河口", english: "the opening of a river" },
        ],
        sources: [
          { candidate: 0, sense: 0 },
          { candidate: 1, sense: 1 },
        ],
      },
      "mouth",
      candidates,
    );

    expect(result.sources).toEqual([
      { senseIndex: 0, kind: "wikipedia", url: candidates[0].url, excerpt: candidates[0].excerpt },
      {
        senseIndex: 1,
        kind: "stackexchange",
        url: candidates[1].url,
        excerpt: candidates[1].excerpt,
      },
    ]);
  });

  it("丢弃越界、重复与同来源重复的配对", () => {
    const candidates = [
      candidate(),
      candidate({ kind: "wikipedia", url: "https://en.wikipedia.org/?curid=2" }),
    ];
    const result = parseWordLookupResult(
      {
        isWord: true,
        lemma: "mouth",
        senses: [{ pos: "n.", chinese: "嘴", english: "the part of the face" }],
        sources: [
          { candidate: 0, sense: 0 },
          { candidate: 1, sense: 0 },
          { candidate: 0, sense: 1 },
          { candidate: 99, sense: 0 },
          "bad",
        ],
      },
      "mouth",
      candidates,
    );

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].excerpt).toBe(candidates[0].excerpt);
  });
});
