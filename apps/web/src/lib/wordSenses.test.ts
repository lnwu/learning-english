import { describe, it, expect } from "bun:test";
import {
  MAX_SENSES,
  decodeSenses,
  encodeSenses,
  sanitizeWordSenses,
  type WordSense,
} from "./wordSenses";

describe("sanitizeWordSenses", () => {
  it("截断到 MAX_SENSES 个义项", () => {
    const senses = sanitizeWordSenses(
      Array.from({ length: MAX_SENSES + 2 }, (_, index) => ({
        pos: "n.",
        chinese: `语文${index}`,
        english: `english ${index}`,
      }))
    );

    expect(senses).toHaveLength(MAX_SENSES);
  });

  it("过滤非法字段与超长内容", () => {
    const senses = sanitizeWordSenses([
      { pos: "n.", chinese: "苹果", english: "a round fruit" },
      { pos: "", chinese: "缺词性", english: "no pos" },
      { pos: "n.", chinese: "", english: "no chinese" },
      { pos: "n.", chinese: "中文", english: "" },
      { pos: "n.", chinese: "超长", english: "x".repeat(151) },
      "not an object",
      null,
    ]);

    expect(senses).toEqual([
      { pos: "n.", chinese: "苹果", english: "a round fruit" },
    ]);
  });

  it("非数组输入返回空数组", () => {
    expect(sanitizeWordSenses(null)).toEqual([]);
    expect(sanitizeWordSenses("bad")).toEqual([]);
  });
});

describe("decodeSenses", () => {
  it("空字符串返回空数组", () => {
    expect(decodeSenses("")).toEqual([]);
    expect(decodeSenses("  \n  ")).toEqual([]);
  });

  it("新格式：每行一个义项，解析词性/中文/英文", () => {
    expect(
      decodeSenses(
        "v. 吐（口水）；喷出 — to force liquid from the mouth\nn. 口水；唾沫 — liquid in the mouth"
      )
    ).toEqual([
      { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
      { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
    ]);
  });

  it("旧格式：首行为英文释义，其余为中文翻译", () => {
    expect(decodeSenses("a round fruit\n苹果")).toEqual([
      { pos: "", chinese: "苹果", english: "a round fruit" },
    ]);
  });

  it("旧格式：多行中文合并到同一义项", () => {
    expect(decodeSenses("a round fruit\n苹果\n一种水果")).toEqual([
      { pos: "", chinese: "苹果\n一种水果", english: "a round fruit" },
    ]);
  });

  it("单行中文作为中文翻译", () => {
    expect(decodeSenses("苹果")).toEqual([
      { pos: "", chinese: "苹果", english: "" },
    ]);
  });

  it("单行英文作为英文释义", () => {
    expect(decodeSenses("a round fruit")).toEqual([
      { pos: "", chinese: "", english: "a round fruit" },
    ]);
  });

  it("去除多余空白", () => {
    expect(decodeSenses("  v. 吐  — to spit \n 苹果 ")).toEqual([
      { pos: "v.", chinese: "吐", english: "to spit" },
      { pos: "", chinese: "苹果", english: "" },
    ]);
  });
});

describe("encodeSenses", () => {
  it("每行一个义项", () => {
    expect(
      encodeSenses([
        { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
        { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
      ])
    ).toBe(
      "v. 吐（口水）；喷出 — to force liquid from the mouth\nn. 口水；唾沫 — liquid in the mouth"
    );
  });

  it("空词性/空英文时省略对应部分", () => {
    expect(encodeSenses([{ pos: "", chinese: "苹果", english: "a round fruit" }])).toBe("苹果 — a round fruit");
    expect(encodeSenses([{ pos: "", chinese: "苹果", english: "" }])).toBe("苹果");
    expect(encodeSenses([{ pos: "", chinese: "", english: "a round fruit" }])).toBe("a round fruit");
  });

  it("空数组返回空字符串", () => {
    expect(encodeSenses([])).toBe("");
  });

  it("输出的编码可被 decodeSenses 无损还原", () => {
    const senses: WordSense[] = [
      { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
      { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
    ];
    expect(decodeSenses(encodeSenses(senses))).toEqual(senses);
  });
});
