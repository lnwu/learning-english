import { describe, it, expect } from "bun:test";
import { MAX_WORD_SOURCES, sanitizeWordSources } from "./wordSources";

const valid = (overrides: Record<string, unknown> = {}) => ({
  senseIndex: 0,
  kind: "wikipedia",
  title: "Apple",
  url: "https://en.wikipedia.org/?curid=1",
  excerpt: "an apple a day",
  ...overrides,
});

describe("sanitizeWordSources", () => {
  it("保留合法来源并去掉首尾空白", () => {
    expect(sanitizeWordSources([valid({ title: "  Apple  " })])).toEqual([
      {
        senseIndex: 0,
        kind: "wikipedia",
        title: "Apple",
        url: "https://en.wikipedia.org/?curid=1",
        excerpt: "an apple a day",
      },
    ]);
  });

  it("丢弃非法来源", () => {
    expect(
      sanitizeWordSources([
        valid({ kind: "news" }),
        valid({ senseIndex: 4 }),
        valid({ senseIndex: -1 }),
        valid({ senseIndex: 0.5 }),
        valid({ url: "http://example.com" }),
        valid({ title: "" }),
        valid({ excerpt: "x".repeat(301) }),
        null,
        "text",
      ]),
    ).toEqual([]);
  });

  it("最多保留三条来源", () => {
    const items = Array.from({ length: 5 }, (_, index) => valid({ title: `t${index}` }));

    expect(sanitizeWordSources(items)).toHaveLength(MAX_WORD_SOURCES);
  });

  it("非数组输入返回空列表", () => {
    expect(sanitizeWordSources(undefined)).toEqual([]);
    expect(sanitizeWordSources({})).toEqual([]);
  });
});
