import { describe, it, expect } from "bun:test";
import {
  parseStackExchangeResults,
  parseUrbanDictionaryResults,
  parseWikipediaResults,
} from "./wordSourceSearch";

describe("parseWikipediaResults", () => {
  it("去掉高亮标签并保留包含目标词的摘录", () => {
    const candidates = parseWikipediaResults(
      {
        query: {
          search: [
            {
              title: "Limited hangout",
              pageid: 6115595,
              snippet:
                'let it <span class="searchmatch">hang</span> <span class="searchmatch">out</span>, so to speak?',
            },
            { title: "Other", pageid: 2, snippet: "nothing relevant here" },
          ],
        },
      },
      "hang out",
    );

    expect(candidates).toEqual([
      {
        kind: "wikipedia",
        title: "Limited hangout",
        url: "https://en.wikipedia.org/?curid=6115595",
        excerpt: "let it hang out, so to speak?",
      },
    ]);
  });

  it("解码数字实体", () => {
    const [candidate] = parseWikipediaResults(
      {
        query: {
          search: [
            {
              title: "Lettin&#039; It All Hang Out",
              pageid: 1,
              snippet: "it&#039;s a <span>hang</span> out",
            },
          ],
        },
      },
      "hang",
    );

    expect(candidate.title).toBe("Lettin' It All Hang Out");
    expect(candidate.excerpt).toBe("it's a hang out");
  });

  it("响应结构异常时返回空列表", () => {
    expect(parseWikipediaResults(null, "hang")).toEqual([]);
    expect(parseWikipediaResults({ query: {} }, "hang")).toEqual([]);
  });
});

describe("parseStackExchangeResults", () => {
  it("解码实体并生成问题链接", () => {
    const candidates = parseStackExchangeResults(
      {
        items: [
          {
            question_id: 116348,
            title: "Is &quot;hang&quot; really short for &quot;hang out&quot;?",
            excerpt:
              '<span class="highlight">hang</span> out with my friends, I&#39;m just gonna <span class="highlight">hang</span> at home',
          },
        ],
      },
      "hang",
    );

    expect(candidates).toEqual([
      {
        kind: "stackexchange",
        title: 'Is "hang" really short for "hang out"?',
        url: "https://english.stackexchange.com/questions/116348",
        excerpt: "hang out with my friends, I'm just gonna hang at home",
      },
    ]);
  });

  it("摘录不含目标词时丢弃", () => {
    expect(
      parseStackExchangeResults(
        { items: [{ question_id: 1, title: "Change", excerpt: "a change of plans" }] },
        "hang",
      ),
    ).toEqual([]);
  });
});

describe("parseUrbanDictionaryResults", () => {
  it("按赞数排序并去掉例句中的方括号", () => {
    const candidates = parseUrbanDictionaryResults(
      {
        list: [
          {
            word: "hang out",
            permalink: "https://www.urbandictionary.com/define.php?term=hang%20out&defid=1",
            thumbs_up: 3,
            example: "We should [hang] out [tonight].",
          },
          {
            word: "hang out",
            permalink: "https://www.urbandictionary.com/define.php?term=hang%20out&defid=2",
            thumbs_up: 40,
            example: "Let's hang out after work.",
          },
        ],
      },
      "hang out",
    );

    expect(candidates.map((candidate) => candidate.excerpt)).toEqual([
      "Let's hang out after work.",
      "We should hang out tonight.",
    ]);
    expect(candidates[0].kind).toBe("urbandictionary");
  });

  it("没有例句或链接不是 https 的条目被丢弃", () => {
    expect(
      parseUrbanDictionaryResults(
        {
          list: [
            { word: "ghost", permalink: "https://u.example/1", thumbs_up: 9, example: "" },
            { word: "ghost", permalink: "http://u.example/2", thumbs_up: 8, example: "a ghost" },
          ],
        },
        "ghost",
      ),
    ).toEqual([]);
  });
});
