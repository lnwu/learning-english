import { describe, it, expect } from "bun:test";
import { buildSourceSelectionMessages, parseSourceSelection } from "./wordSourceSelection";
import type { WordSourceCandidate } from "./wordSourceSearch";
import type { WordSense } from "./wordSenses";

const senses: WordSense[] = [
  { pos: "v.", chinese: "闲逛", english: "to spend time relaxing with someone" },
  { pos: "v.", chinese: "挂", english: "to hang something up" },
];

const candidates: WordSourceCandidate[] = [
  {
    kind: "stackexchange",
    title: "Q1",
    url: "https://english.stackexchange.com/questions/1",
    excerpt: "c0",
  },
  {
    kind: "urbandictionary",
    title: "hang out",
    url: "https://www.urbandictionary.com/a",
    excerpt: "c1",
  },
  { kind: "wikipedia", title: "Laundry", url: "https://en.wikipedia.org/?curid=3", excerpt: "c2" },
];

describe("buildSourceSelectionMessages", () => {
  it("按 system + user 两段构造，并给出编号的义项与候选", () => {
    const messages = buildSourceSelectionMessages("hang out", senses, candidates);

    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(messages[1].content).toContain("0. v. 闲逛");
    expect(messages[1].content).toContain("2. [wikipedia] c2");
  });
});

describe("parseSourceSelection", () => {
  it("把合法的候选与义项组合成来源", () => {
    expect(
      parseSourceSelection(
        {
          sources: [
            { candidate: 1, sense: 0 },
            { candidate: 2, sense: 1 },
          ],
        },
        senses,
        candidates,
      ),
    ).toEqual([
      {
        senseIndex: 0,
        kind: "urbandictionary",
        title: "hang out",
        url: "https://www.urbandictionary.com/a",
        excerpt: "c1",
      },
      {
        senseIndex: 1,
        kind: "wikipedia",
        title: "Laundry",
        url: "https://en.wikipedia.org/?curid=3",
        excerpt: "c2",
      },
    ]);
  });

  it("忽略越界、重复和非整数的编号", () => {
    expect(
      parseSourceSelection(
        {
          sources: [
            { candidate: 9, sense: 0 },
            { candidate: 0, sense: 5 },
            { candidate: 0, sense: 0 },
            { candidate: 0, sense: 1 },
            { candidate: 1.5, sense: 0 },
            { candidate: "1", sense: 0 },
          ],
        },
        senses,
        candidates,
      ),
    ).toEqual([
      {
        senseIndex: 0,
        kind: "stackexchange",
        title: "Q1",
        url: "https://english.stackexchange.com/questions/1",
        excerpt: "c0",
      },
    ]);
  });

  it("最多保留三条，且响应缺失时返回空列表", () => {
    const pool = Array.from({ length: 5 }, (_, index) => ({
      kind: "wikipedia" as const,
      title: `t${index}`,
      url: `https://en.wikipedia.org/?curid=${index}`,
      excerpt: `e${index}`,
    }));
    const many = pool.map((_, index) => ({ candidate: index, sense: 0 }));
    expect(parseSourceSelection({ sources: many }, senses, pool)).toHaveLength(3);

    expect(parseSourceSelection({}, senses, candidates)).toEqual([]);
    expect(parseSourceSelection(null, senses, candidates)).toEqual([]);
  });
});
