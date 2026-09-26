import { describe, it, expect } from "bun:test";
import {
  buildCheckMessages,
  buildExactMatchResult,
  buildGenerateMessages,
  isExactMatchAnswer,
  parseCheckResult,
  parseGenerateResult,
} from "./sentenceMessages";

describe("buildGenerateMessages", () => {
  it("user 消息带上候选词与参考译法，system 要求返回所选词", () => {
    const messages = buildGenerateMessages([
      { word: "apple", translation: "苹果" },
      { word: "run", translation: "" },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain('"words"');
    expect(messages[1].content).toContain("apple（苹果）");
    expect(messages[1].content).toContain("run");
    expect(messages[1].content).not.toContain("run（）");
  });
});

describe("parseGenerateResult", () => {
  const candidates = ["apple", "run", "banana"];

  it("去除首尾空白后返回结果，words 匹配候选词原文", () => {
    expect(
      parseGenerateResult(
        { chinese: " 你好 ", english: " hi ", words: ["RUN", " apple "] },
        candidates,
      ),
    ).toEqual({
      chinese: "你好",
      english: "hi",
      words: ["run", "apple"],
    });
  });

  it("字段缺失或为空时返回 null", () => {
    expect(parseGenerateResult(null, candidates)).toBeNull();
    expect(
      parseGenerateResult({ chinese: "", english: "hi", words: ["apple", "run"] }, candidates),
    ).toBeNull();
    expect(
      parseGenerateResult({ chinese: "你好", english: 42, words: ["apple", "run"] }, candidates),
    ).toBeNull();
  });

  it("过滤非候选词与重复项", () => {
    const result = parseGenerateResult(
      { chinese: "你好", english: "hi", words: ["apple", "orange", "APPLE", 42, "run"] },
      candidates,
    );

    expect(result?.words).toEqual(["apple", "run"]);
  });

  it("所选词超过 3 个时只保留前 3 个", () => {
    const result = parseGenerateResult(
      { chinese: "你好", english: "hi", words: ["apple", "run", "banana", "pear"] },
      [...candidates, "pear"],
    );

    expect(result?.words).toEqual(["apple", "run", "banana"]);
  });

  it("有效词不足 2 个时返回 null", () => {
    expect(
      parseGenerateResult({ chinese: "你好", english: "hi", words: ["apple"] }, candidates),
    ).toBeNull();
    expect(
      parseGenerateResult({ chinese: "你好", english: "hi", words: [] }, candidates),
    ).toBeNull();
    expect(parseGenerateResult({ chinese: "你好", english: "hi" }, candidates)).toBeNull();
  });
});

describe("buildCheckMessages", () => {
  it("user 消息包含中文、目标词、参考译文与学生译文", () => {
    const messages = buildCheckMessages({
      chinese: "我每天跑步。",
      words: ["run"],
      reference: "I run every day.",
      userAnswer: "I run everyday.",
    });

    expect(messages[1].content).toContain("我每天跑步。");
    expect(messages[1].content).toContain("run");
    expect(messages[1].content).toContain("I run every day.");
    expect(messages[1].content).toContain("I run everyday.");
  });
});

describe("isExactMatchAnswer", () => {
  it("忽略大小写、标点与多余空白", () => {
    expect(isExactMatchAnswer("I run every day.", "i run every day")).toBe(true);
    expect(isExactMatchAnswer("I run every day.", "  I RUN EVERY DAY!  ")).toBe(true);
  });

  it("内容不同或两侧为空时返回 false", () => {
    expect(isExactMatchAnswer("I run every day.", "I run everyday.")).toBe(false);
    expect(isExactMatchAnswer("", "I run")).toBe(false);
    expect(isExactMatchAnswer("I run", "")).toBe(false);
    expect(isExactMatchAnswer("I run", "   ")).toBe(false);
  });
});

describe("buildExactMatchResult", () => {
  it("返回完整批改结果，usedWords 按参考译文推导", () => {
    expect(buildExactMatchResult("I run every day.", ["run", "apple"])).toEqual({
      correct: true,
      score: 100,
      feedback: "答案正确，评分已按大小写不敏感处理。",
      corrected: "I run every day.",
      issues: [],
      usedWords: ["run"],
    });
  });
});

describe("parseCheckResult", () => {
  const words = ["run", "apple"];

  it("正常输出原样返回，usedWords 只保留目标词", () => {
    const result = parseCheckResult(
      {
        correct: true,
        score: 87,
        feedback: "不错",
        corrected: "I run every day.",
        issues: ["时态"],
        usedWords: ["run", "banana"],
      },
      words,
    );

    expect(result).toEqual({
      correct: true,
      score: 87,
      feedback: "不错",
      corrected: "I run every day.",
      issues: ["时态"],
      usedWords: ["run"],
    });
  });

  it("score 夹取到 0-100 并取整", () => {
    expect(parseCheckResult({ score: 150 }, words).score).toBe(100);
    expect(parseCheckResult({ score: -5 }, words).score).toBe(0);
    expect(parseCheckResult({ score: 87.6 }, words).score).toBe(88);
    expect(parseCheckResult({ score: Number.NaN }, words).score).toBe(0);
    expect(parseCheckResult({ score: "90" }, words).score).toBe(0);
  });

  it("feedback 与 corrected 超长时截断", () => {
    const result = parseCheckResult(
      { feedback: "a".repeat(2500), corrected: "b".repeat(600) },
      words,
    );

    expect(result.feedback).toHaveLength(2000);
    expect(result.corrected).toHaveLength(500);
  });

  it("issues 过滤非字符串并限制条数", () => {
    const result = parseCheckResult(
      { issues: [...Array.from({ length: 12 }, (_, i) => `i${i}`), 42, null] },
      words,
    );

    expect(result.issues).toHaveLength(10);
    expect(result.issues[0]).toBe("i0");
  });

  it("字段缺失或类型错误时回退默认值", () => {
    const result = parseCheckResult(null, words);

    expect(result).toEqual({
      correct: false,
      score: 0,
      feedback: "",
      corrected: "",
      issues: [],
      usedWords: words,
    });
  });
});
