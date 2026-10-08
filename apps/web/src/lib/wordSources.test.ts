import { describe, it, expect } from "bun:test";
import { sanitizeWordSources } from "./wordSources";

const valid = (overrides: Record<string, unknown> = {}) => ({
  senseIndex: 0,
  kind: "wikipedia",
  url: "https://en.wikipedia.org/?curid=1",
  excerpt: "an apple a day",
  ...overrides,
});

describe("sanitizeWordSources", () => {
  it("保留合法来源并去掉首尾空白", () => {
    expect(sanitizeWordSources([valid({ url: "  https://en.wikipedia.org/?curid=1  " })])).toEqual([
      {
        senseIndex: 0,
        kind: "wikipedia",
        url: "https://en.wikipedia.org/?curid=1",
        excerpt: "an apple a day",
      },
    ]);
  });

  it("丢弃非法来源", () => {
    expect(
      sanitizeWordSources([
        valid({ kind: "news" }),
        valid({ senseIndex: 3 }),
        valid({ senseIndex: -1 }),
        valid({ senseIndex: 0.5 }),
        valid({ url: "http://example.com" }),
        valid({ excerpt: "" }),
        valid({ excerpt: "x".repeat(301) }),
        null,
        "text",
      ]),
    ).toEqual([]);
  });

  it("同一义项同一来源只保留一条", () => {
    expect(
      sanitizeWordSources([
        valid({ excerpt: "first" }),
        valid({ excerpt: "second" }),
        valid({ senseIndex: 1, excerpt: "third" }),
      ]),
    ).toEqual([
      {
        senseIndex: 0,
        kind: "wikipedia",
        url: "https://en.wikipedia.org/?curid=1",
        excerpt: "first",
      },
      {
        senseIndex: 1,
        kind: "wikipedia",
        url: "https://en.wikipedia.org/?curid=1",
        excerpt: "third",
      },
    ]);
  });

  it("非数组输入返回空列表", () => {
    expect(sanitizeWordSources(undefined)).toEqual([]);
    expect(sanitizeWordSources({})).toEqual([]);
  });
});
