import { describe, it, expect } from "bun:test";
import { AiServiceError } from "./aiClient";
import {
  buildLemmaMessages,
  buildMeaningMessages,
  buildSelectionMessages,
  buildSourcesMessages,
  parseLemmaResult,
  parseSelectionResult,
  parseSensesResult,
  parseSourcesResult,
} from "./wordLookup";
import { MAX_SENSES } from "./wordSenses";
import type { WordSourceCandidate } from "./wordSourceSearch";

const candidate = (overrides: Partial<WordSourceCandidate> = {}): WordSourceCandidate => ({
  kind: "wikipedia",
  url: "https://en.wikipedia.org/?curid=1",
  excerpt: "a mouth is where a river flows into a larger body of water",
  ...overrides,
});

const senses = [
  { pos: "n.", chinese: "嘴", english: "the part of the face" },
  { pos: "n.", chinese: "河口", english: "the opening of a river" },
];

describe("buildLemmaMessages", () => {
  it("user 消息是单词本身，system 要求词形分析与 JSON 输出", () => {
    const messages = buildLemmaMessages("running");

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("isWord");
    expect(messages[0].content).toContain("lemma");
    expect(messages[0].content).toContain("Return JSON only");
    expect(messages[1]).toEqual({ role: "user", content: "running" });
  });
});

describe("parseLemmaResult", () => {
  it("有效单词返回清洗后的 lemma", () => {
    expect(parseLemmaResult({ isWord: true, lemma: "Run" }, "running")).toEqual({
      isWord: true,
      lemma: "run",
    });
  });

  it("非单词返回 isWord: false 并回退 lemma", () => {
    expect(parseLemmaResult({ isWord: false, lemma: "asdf" }, "asdf")).toEqual({
      isWord: false,
      lemma: "asdf",
    });
  });

  it("isWord 非布尔 true 视为未识别", () => {
    expect(parseLemmaResult({ isWord: "false" }, "asdf").isWord).toBe(false);
  });

  it("lemma 非法时回退原词", () => {
    expect(parseLemmaResult({ isWord: true, lemma: "not a word!" }, "word").lemma).toBe("word");
  });
});

describe("buildMeaningMessages", () => {
  it("只有一条 user 消息，自然提问且要求 JSON 输出", () => {
    const messages = buildMeaningMessages("agnostic");

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain('What does the English word "agnostic" mean?');
    expect(messages[0].content).toContain("Return JSON only");
  });

  it("自然提问、要求覆盖 computing 语域并限制长度，且要求 JSON 输出", () => {
    const content = buildMeaningMessages("mouth")[0].content;
    expect(content).toContain('What does the English word "mouth" mean?');
    expect(content).toContain("Return JSON only");
    expect(content).toContain("pos");
    expect(content).toContain("chinese");
    expect(content).toContain("english");
    expect(content).toContain("a dictionary of computing would list");
    expect(content).toContain("Otherwise do not mention computing");
    expect(content).toContain("Do not include proper nouns");
    expect(content).toContain("under 200 characters");
  });
});

describe("buildSelectionMessages", () => {
  it("带 0 起始编号列表与取用的含义数量", () => {
    const content = buildSelectionMessages("mouth", senses)[0].content;

    expect(content).toContain('Here are senses of the English word "mouth"');
    expect(content).toContain("0. n. the part of the face");
    expect(content).toContain("1. n. the opening of a river");
    expect(content).toContain(`${MAX_SENSES} of these senses`);
    expect(content).toContain(
      "Always include a sense marked as specific to a domain such as computing",
    );
    expect(content).toContain("Do not pick two senses that express the same meaning");
    expect(content).toContain("Return JSON only");
  });
});

describe("parseSelectionResult", () => {
  const six = Array.from({ length: 6 }, (_, index) => ({
    pos: "n.",
    chinese: `语文${index}`,
    english: `english ${index}`,
  }));

  it("保留模型给出的顺序与编号", () => {
    expect(parseSelectionResult({ senses: [4, 0, 2] }, six.length)).toEqual([4, 0, 2]);
  });

  it("丢弃越界、重复与非整数编号", () => {
    expect(parseSelectionResult({ senses: [1, 1, 9, -1, 0.5, "2", 2] }, six.length)).toEqual([
      1, 2,
    ]);
  });

  it("最多接受 MAX_SENSES 个编号", () => {
    expect(parseSelectionResult({ senses: [0, 1, 2, 3, 4] }, six.length)).toHaveLength(MAX_SENSES);
  });

  it("无可用编号时返回 null", () => {
    expect(parseSelectionResult({ senses: [] }, 6)).toBeNull();
    expect(parseSelectionResult({ senses: "bad" }, 6)).toBeNull();
    expect(parseSelectionResult({}, 6)).toBeNull();
  });
});

describe("parseSensesResult", () => {
  it("返回清洗后的含义", () => {
    expect(
      parseSensesResult({ senses: [{ pos: "v.", chinese: "跑", english: "to move quickly" }] }),
    ).toEqual([{ pos: "v.", chinese: "跑", english: "to move quickly" }]);
  });

  it("含义全部非法时抛出 502", () => {
    expect(() => parseSensesResult({ senses: [{ pos: "", chinese: "" }] })).toThrow(AiServiceError);
  });

  it("senses 缺失时抛出 502", () => {
    expect(() => parseSensesResult({})).toThrow(AiServiceError);
  });
});

describe("buildSourcesMessages", () => {
  it("user 消息带词、含义 JSON 与编号候选", () => {
    const messages = buildSourcesMessages("mouth", senses, [
      candidate(),
      candidate({ kind: "stackexchange", url: "https://english.stackexchange.com/questions/1" }),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("Word: mouth");
    expect(messages[1].content).toContain(JSON.stringify(senses));
    expect(messages[1].content).toContain("0. [wikipedia]");
    expect(messages[1].content).toContain("1. [stackexchange]");
  });
});

describe("parseSourcesResult", () => {
  it("按候选编号配对来源", () => {
    const candidates = [
      candidate(),
      candidate({ kind: "stackexchange", url: "https://english.stackexchange.com/questions/1" }),
    ];
    const result = parseSourcesResult(
      {
        sources: [
          { candidate: 0, sense: 0 },
          { candidate: 1, sense: 1 },
        ],
      },
      senses,
      candidates,
    );

    expect(result).toEqual([
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
    const result = parseSourcesResult(
      {
        sources: [
          { candidate: 0, sense: 0 },
          { candidate: 1, sense: 0 },
          { candidate: 0, sense: 1 },
          { candidate: 99, sense: 0 },
          "bad",
        ],
      },
      senses.slice(0, 1),
      candidates,
    );

    expect(result).toHaveLength(1);
    expect(result[0].excerpt).toBe(candidates[0].excerpt);
  });

  it("sources 缺失或非数组时返回空数组", () => {
    expect(parseSourcesResult({}, senses, [candidate()])).toEqual([]);
    expect(parseSourcesResult({ sources: "bad" }, senses, [candidate()])).toEqual([]);
  });
});
