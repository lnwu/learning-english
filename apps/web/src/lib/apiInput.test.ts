import { describe, it, expect } from "bun:test";
import {
  aiModelIdList,
  badRequest,
  clientLogEntries,
  optionalAiModelId,
  optionalBoolean,
  optionalText,
  parseBody,
  requiredText,
  sentenceWordList,
  wordList,
  wordToken,
  type FieldParser,
} from "./apiInput";

const errorOf = <T>(parser: FieldParser<T>, raw: unknown): string | null => {
  const result = parser(raw);
  return result.ok ? null : result.code;
};

const valueOf = <T>(parser: FieldParser<T>, raw: unknown): T | undefined => {
  const result = parser(raw);
  return result.ok ? result.value : undefined;
};

describe("badRequest", () => {
  it("返回 400、错误码与中文文案", async () => {
    const response = badRequest("invalidWord");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalidWord", error: "无效单词" });
  });
});

describe("requiredText", () => {
  const parser = requiredText({ maxLength: 10, code: "missingSentence" });

  it("缺失或纯空白返回指定错误码", () => {
    expect(errorOf(parser, undefined)).toBe("missingSentence");
    expect(errorOf(parser, "")).toBe("missingSentence");
    expect(errorOf(parser, "   ")).toBe("missingSentence");
    expect(errorOf(parser, 5)).toBe("missingSentence");
  });

  it("超长返回统一错误码", () => {
    expect(errorOf(parser, "x".repeat(11))).toBe("inputTooLong");
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

  it("超长返回统一错误码", () => {
    expect(errorOf(parser, "abcdef")).toBe("inputTooLong");
  });
});

describe("wordToken", () => {
  const parser = wordToken();

  it("去空白并转小写", () => {
    expect(valueOf(parser, " Apple ")).toBe("apple");
  });

  it("非字母、超长或非字符串都返回无效单词", () => {
    expect(errorOf(parser, "ap ple")).toBe("invalidWord");
    expect(errorOf(parser, "a".repeat(51))).toBe("invalidWord");
    expect(errorOf(parser, 123)).toBe("invalidWord");
    expect(errorOf(parser, "")).toBe("invalidWord");
  });
});

describe("optionalBoolean", () => {
  const parser = optionalBoolean();

  it("只有 true 解析为 true", () => {
    expect(valueOf(parser, true)).toBe(true);
    expect(valueOf(parser, false)).toBe(false);
    expect(valueOf(parser, undefined)).toBe(false);
    expect(valueOf(parser, "true")).toBe(false);
  });
});

describe("wordList", () => {
  const parser = wordList({ maxItems: 2, maxItemLength: 4 });

  it("非数组返回空数组", () => {
    expect(valueOf(parser, undefined)).toEqual([]);
  });

  it("过滤非字符串与空值并截断到上限", () => {
    expect(valueOf(parser, [" ab ", 5, "", "cdef", "ghij"])).toEqual(["ab", "cdef"]);
  });

  it("截断后仍超长返回统一错误码", () => {
    expect(errorOf(parser, ["abcdef"])).toBe("inputTooLong");
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
      ]),
    ).toEqual([{ word: "tree", translation: "树" }]);
  });

  it("截断到上限", () => {
    expect(
      valueOf(parser, [
        { word: "a", translation: "" },
        { word: "b", translation: "" },
        { word: "c", translation: "" },
      ]),
    ).toEqual([
      { word: "a", translation: "" },
      { word: "b", translation: "" },
    ]);
  });

  it("单词或释义超长返回统一错误码", () => {
    expect(errorOf(parser, [{ word: "abcdef", translation: "" }])).toBe("inputTooLong");
    expect(errorOf(parser, [{ word: "a", translation: "五个字以上" }])).toBe("inputTooLong");
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

  it("首个失败字段决定 400 错误码", async () => {
    const result = parse({ word: "ap ple" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ code: "invalidWord", error: "无效单词" });
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

describe("optionalAiModelId", () => {
  const parser = optionalAiModelId();

  it("缺省与空串解析为空", () => {
    expect(parser(undefined)).toEqual({ ok: true, value: "" });
    expect(parser("")).toEqual({ ok: true, value: "" });
  });

  it("注册表中的模型解析通过", () => {
    expect(parser("deepseek/deepseek-flash")).toEqual({
      ok: true,
      value: "deepseek/deepseek-flash",
    });
  });

  it("未知模型报错", () => {
    expect(parser("unknown/model").ok).toBe(false);
    expect(parser(123).ok).toBe(false);
  });
});

describe("aiModelIdList", () => {
  const parser = aiModelIdList({ maxItems: 4 });

  it("去重并保留合法模型", () => {
    expect(
      parser(["mimo/mimo-v2.6-flash", "mimo/mimo-v2.6-flash", "deepseek/deepseek-flash"]),
    ).toEqual({
      ok: true,
      value: ["mimo/mimo-v2.6-flash", "deepseek/deepseek-flash"],
    });
  });

  it("空数组与非数组报错", () => {
    expect(parser([]).ok).toBe(false);
    expect(parser("mimo/mimo-v2.6-flash").ok).toBe(false);
  });

  it("包含未知模型报错", () => {
    expect(parser(["mimo/mimo-v2.6-flash", "unknown/model"]).ok).toBe(false);
  });

  it("超量报错", () => {
    expect(
      parser([
        "deepseek/deepseek-flash",
        "mimo/mimo-v2.6-flash",
        "mimo/mimo-v2.6-pro",
        "opencode/gemini-3.8-flash",
        "opencode/claude-opus-5-5",
      ]).ok,
    ).toBe(false);
  });
});

describe("clientLogEntries", () => {
  const parser = clientLogEntries({
    maxItems: 2,
    maxMessageLength: 10,
    maxFieldCount: 2,
    maxValueLength: 4,
  });

  it("保留合法事件并裁剪字段", () => {
    expect(
      valueOf(parser, [
        {
          event: "sync.batch.failed",
          level: "error",
          message: "boom",
          fields: { attempt: 1, note: "abcdefgh", nested: { a: 1 }, extra: "x" },
        },
      ]),
    ).toEqual([
      {
        event: "sync.batch.failed",
        level: "error",
        message: "boom",
        fields: { attempt: 1, note: "abcd" },
      },
    ]);
  });

  it("拒绝白名单之外的事件与非法级别", () => {
    expect(errorOf(parser, [{ event: "api.request", level: "error", message: "boom" }])).toBe(
      "unknownLogEvent",
    );
    expect(errorOf(parser, [{ event: "app.error", level: "info", message: "boom" }])).toBe(
      "incompleteLogEntry",
    );
  });

  it("拒绝空数组、超量与超长消息", () => {
    expect(errorOf(parser, [])).toBe("missingLogEntries");
    expect(
      errorOf(parser, [
        { event: "app.error", level: "error", message: "a" },
        { event: "app.error", level: "error", message: "b" },
        { event: "app.error", level: "error", message: "c" },
      ]),
    ).toBe("tooManyLogEntries");
    expect(errorOf(parser, [{ event: "app.error", level: "error", message: "x".repeat(11) }])).toBe(
      "inputTooLong",
    );
  });
});
