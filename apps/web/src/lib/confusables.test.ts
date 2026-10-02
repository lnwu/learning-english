import { describe, it, expect } from "bun:test";
import {
  buildConfusableGroupsMessages,
  buildConfusableSensesMessages,
  parseConfusableGroups,
  parseConfusableSenses,
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

describe("buildConfusableGroupsMessages", () => {
  it("把全部单词压缩为 pos 与 chinese，并要求只返回词组", () => {
    const messages = buildConfusableGroupsMessages(book);

    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain('"word":"medicine"');
    expect(messages[1]?.content).toContain('"chinese":"药、医学"');
    expect(messages[1]?.content).not.toContain("definition of medicine");
    expect(messages[0]?.content).toContain('{"groups"');
  });

  it("送去模型的 chinese 去掉尾部括号限定语", () => {
    const messages = buildConfusableGroupsMessages([
      input("quality", "质量（好坏程度）"),
      input("receive", "接收(信号)（信号）"),
      input("college", "（英国）公学"),
    ]);

    expect(messages[1]?.content).toContain('"chinese":"质量"');
    expect(messages[1]?.content).toContain('"chinese":"接收"');
    expect(messages[1]?.content).toContain('"chinese":"（英国）公学"');
  });
});

describe("parseConfusableGroups", () => {
  it("转小写并只保留词库内不重复的词", () => {
    const raw = { groups: [["Medicine", "MEDICATION", "medicine", "drug", 5]] };

    expect(parseConfusableGroups(raw, allowedWords)).toEqual([["medicine", "medication"]]);
  });

  it("缺少 groups 或形状不对时返回空数组", () => {
    expect(parseConfusableGroups({ groups: [] }, allowedWords)).toEqual([]);
    expect(parseConfusableGroups({ results: [] }, allowedWords)).toEqual([]);
    expect(parseConfusableGroups(null, allowedWords)).toEqual([]);
  });

  it("清洗后不足两个词的组被丢弃", () => {
    const raw = { groups: [["medicine"], ["medicine", "drug"], "medicine"] };

    expect(parseConfusableGroups(raw, allowedWords)).toEqual([]);
  });

  it("一个词只归属先出现的组", () => {
    const raw = {
      groups: [
        ["medicine", "medication"],
        ["medication", "duplicate"],
      ],
    };

    expect(parseConfusableGroups(raw, allowedWords)).toEqual([["medicine", "medication"]]);
  });

  it("每组截断到上限", () => {
    const words = Array.from(
      { length: MAX_CONFUSABLES_PER_WORD + 2 },
      (_, index) => `word${index}`,
    );

    const groups = parseConfusableGroups({ groups: [words] }, words);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(MAX_CONFUSABLES_PER_WORD);
  });
});

describe("buildConfusableSensesMessages", () => {
  it("只把这一组词交给模型", () => {
    const messages = buildConfusableSensesMessages([
      input("medicine", "药、医学"),
      input("medication", "药物"),
    ]);

    expect(messages[0]?.content).toContain("同一组易混词");
    expect(messages[1]?.content).toContain('"word":"medication"');
    expect(messages[1]?.content).not.toContain('"word":"duplicate"');
  });
});

describe("parseConfusableSenses", () => {
  it("保留组内词的改写义项与区分说明", () => {
    const raw = {
      results: [
        {
          word: "Medicine",
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

    expect(parseConfusableSenses(raw, ["medicine", "medication"])).toEqual([
      {
        word: "medicine",
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
        senses: [
          {
            pos: "n.",
            chinese: "药（处方药）",
            english: "prescribed drugs",
            note: "与 medicine 比，仅指药品",
          },
        ],
      },
    ]);
  });

  it("丢弃提到组外单词或提到自身的区分说明", () => {
    const raw = {
      results: [
        {
          word: "medicine",
          senses: [
            { pos: "n.", chinese: "药；医学", english: "e1", note: "与 medication 比，还可指医学" },
            { pos: "n.", chinese: "医学", english: "e2", note: "与 drug 比，更泛指" },
            { pos: "n.", chinese: "药", english: "e3", note: "medicine 常指治疗用药" },
          ],
        },
      ],
    };

    expect(parseConfusableSenses(raw, ["medicine", "medication"])).toEqual([
      {
        word: "medicine",
        senses: [
          { pos: "n.", chinese: "药；医学", english: "e1", note: "与 medication 比，还可指医学" },
          { pos: "n.", chinese: "医学", english: "e2" },
          { pos: "n.", chinese: "药", english: "e3" },
        ],
      },
    ]);
  });

  it("丢弃组外单词、无效义项与重复记录", () => {
    const raw = {
      results: [
        { word: "duplicate", senses: [{ pos: "n.", chinese: "复制", english: "e" }] },
        { word: "medicine", senses: [] },
        { word: "medication", senses: [{ pos: "n.", chinese: "药物", english: "e" }] },
        { word: "medication", senses: [{ pos: "n.", chinese: "药", english: "e2" }] },
      ],
    };

    expect(parseConfusableSenses(raw, ["medicine", "medication"])).toEqual([
      { word: "medication", senses: [{ pos: "n.", chinese: "药物", english: "e" }] },
    ]);
  });
});
