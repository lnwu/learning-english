import { describe, it, expect } from "bun:test";
import {
  buildConfusablesMessages,
  parseConfusablesResults,
  MAX_CONFUSABLES_PER_WORD,
  type ConfusableWordInput,
} from "./confusables";

const input = (word: string, chinese: string): ConfusableWordInput => ({
  word,
  senses: [{ pos: "n.", chinese, english: `definition of ${word}` }],
});

const book = [
  input("medicine", "药、医学"),
  input("medication", "药物"),
  input("replicate", "复制"),
  input("duplicate", "复制"),
  input("apple", "苹果"),
];

const allowedWords = book.map((item) => item.word);

describe("buildConfusablesMessages", () => {
  it("批量模式把全部单词压缩为 pos 与 chinese", () => {
    const messages = buildConfusablesMessages(book);

    expect(messages).toHaveLength(2);
    const user = messages[1];
    expect(user?.role).toBe("user");
    expect(user?.content).toContain('"word":"medicine"');
    expect(user?.content).toContain('"chinese":"药、医学"');
    expect(user?.content).not.toContain("definition of medicine");
  });

  it("送去模型的 chinese 去掉括号限定语", () => {
    const messages = buildConfusablesMessages([
      input("quality", "质量（好坏程度）"),
      input("character", "性格、品质（人格特点）"),
      input("college", "（英国）公学"),
    ]);

    expect(messages[1]?.content).toContain('"chinese":"质量"');
    expect(messages[1]?.content).toContain('"chinese":"性格、品质"');
    expect(messages[1]?.content).toContain('"chinese":"公学"');
  });

  it("focus 模式在系统提示中点名目标单词，用户内容仍是全部单词", () => {
    const messages = buildConfusablesMessages(book, "medication");

    expect(messages[0]?.content).toContain("与目标单词 medication 易混");
    expect(messages[1]?.content).toContain('"word":"medication"');
    expect(messages[1]?.content).toContain('"word":"medicine"');
  });
});

describe("parseConfusablesResults", () => {
  it("解析结果并把同组词对称化", () => {
    const raw = {
      results: [
        {
          word: "medicine",
          confusables: ["medication"],
          senses: [
            {
              pos: "n.",
              chinese: "药；医学（学科）",
              english: "drugs or the science",
              note: "与 medication 比，还可指医学",
            },
          ],
        },
        {
          word: "medication",
          confusables: ["medicine"],
          senses: [
            {
              pos: "n.",
              chinese: "药（处方药）",
              english: "prescribed drugs",
              note: "与 medicine 比，仅指药品",
            },
          ],
        },
      ],
    };

    const results = parseConfusablesResults(raw, allowedWords);

    expect(results.map((item) => item.word)).toEqual(["medication", "medicine"]);
    expect(results.find((item) => item.word === "medicine")?.confusables).toEqual(["medication"]);
    expect(results.find((item) => item.word === "medication")?.confusables).toEqual(["medicine"]);
  });

  it("单向声明的边也会补全为同组", () => {
    const raw = {
      results: [
        {
          word: "replicate",
          confusables: ["duplicate"],
          senses: [
            {
              pos: "v.",
              chinese: "复现（实验）",
              english: "repeat exactly",
              note: "与 duplicate 比，强调复现",
            },
          ],
        },
        {
          word: "duplicate",
          confusables: [],
          senses: [
            {
              pos: "v.",
              chinese: "复制（副本）",
              english: "make a copy",
              note: "与 replicate 比，强调副本",
            },
          ],
        },
      ],
    };

    const results = parseConfusablesResults(raw, allowedWords);

    expect(results.find((item) => item.word === "duplicate")?.confusables).toEqual(["replicate"]);
  });

  it("只对称化声明的边，不把链上的词传递成一组", () => {
    const raw = {
      results: [
        {
          word: "medicine",
          confusables: ["medication"],
          senses: [{ pos: "n.", chinese: "药；医学", english: "e1", note: "n1" }],
        },
        {
          word: "medication",
          confusables: ["medicine", "duplicate"],
          senses: [{ pos: "n.", chinese: "药", english: "e2", note: "n2" }],
        },
        {
          word: "duplicate",
          confusables: ["medication"],
          senses: [{ pos: "v.", chinese: "复制", english: "e3", note: "n3" }],
        },
      ],
    };

    const results = parseConfusablesResults(raw, allowedWords);
    const confusablesOf = (word: string) => results.find((item) => item.word === word)?.confusables;

    expect(confusablesOf("medicine")).toEqual(["medication"]);
    expect(confusablesOf("medication")).toEqual(["duplicate", "medicine"]);
    expect(confusablesOf("duplicate")).toEqual(["medication"]);
  });

  it("丢弃提到词库外单词或提到自身的区分说明", () => {
    const raw = {
      results: [
        {
          word: "medicine",
          confusables: ["medication"],
          senses: [
            {
              pos: "n.",
              chinese: "药；医学",
              english: "e1",
              note: "与 medication 比，还可指医学",
            },
            {
              pos: "n.",
              chinese: "医学",
              english: "e2",
              note: "与 drug 比，更泛指",
            },
            {
              pos: "n.",
              chinese: "药",
              english: "e3",
              note: "medicine 常指治疗用药",
            },
          ],
        },
        {
          word: "medication",
          confusables: ["medicine"],
          senses: [
            { pos: "n.", chinese: "药物", english: "e4", note: "与 medicine 比，多指处方药" },
          ],
        },
      ],
    };

    const results = parseConfusablesResults(raw, allowedWords);
    const medicine = results.find((item) => item.word === "medicine");

    expect(medicine?.senses.map((sense) => sense.note)).toEqual([
      "与 medication 比，还可指医学",
      undefined,
      undefined,
    ]);
    expect(results.find((item) => item.word === "medication")?.senses[0]?.note).toBe(
      "与 medicine 比，多指处方药",
    );
  });

  it("丢弃未知单词、无效义项与不在组内的结果", () => {
    const raw = {
      results: [
        {
          word: "unknown",
          confusables: ["medicine"],
          senses: [{ pos: "n.", chinese: "x", english: "y" }],
        },
        {
          word: "apple",
          confusables: [],
          senses: [{ pos: "n.", chinese: "苹果", english: "a fruit" }],
        },
        {
          word: "medicine",
          confusables: ["unknown"],
          senses: [{ pos: "n.", chinese: "药", english: "e" }],
        },
        { word: "medication", confusables: ["medicine"], senses: [] },
      ],
    };

    expect(parseConfusablesResults(raw, allowedWords)).toEqual([]);
  });

  it("每个词的易混词列表截断到上限且不含自身", () => {
    const others = Array.from({ length: MAX_CONFUSABLES_PER_WORD + 3 }, (_, index) =>
      input(`word${String(index).padStart(2, "0")}`, "相同"),
    );
    const words = [input("target", "相同"), ...others];
    const raw = {
      results: [
        {
          word: "target",
          confusables: ["target", ...others.map((item) => item.word)],
          senses: [{ pos: "n.", chinese: "相同", english: "e", note: "n" }],
        },
        ...others.map((item) => ({
          word: item.word,
          confusables: ["target"],
          senses: [{ pos: "n.", chinese: "相同", english: "e", note: "n" }],
        })),
      ],
    };

    const results = parseConfusablesResults(
      raw,
      words.map((item) => item.word),
    );
    const target = results.find((item) => item.word === "target");

    expect(target?.confusables).toHaveLength(MAX_CONFUSABLES_PER_WORD);
    expect(target?.confusables).not.toContain("target");
  });

  it("声明的易混词过滤自身与重复项", () => {
    const raw = {
      results: [
        {
          word: "medicine",
          confusables: ["medicine", "medication", "medication"],
          senses: [{ pos: "n.", chinese: "药；医学", english: "e1", note: "n1" }],
        },
        {
          word: "medication",
          confusables: [],
          senses: [{ pos: "n.", chinese: "药", english: "e2", note: "n2" }],
        },
      ],
    };

    const results = parseConfusablesResults(raw, allowedWords);

    expect(results).toHaveLength(2);
    expect(results.find((item) => item.word === "medicine")?.confusables).toEqual(["medication"]);
  });
});
