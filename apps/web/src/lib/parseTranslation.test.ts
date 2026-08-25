import { describe, it, expect } from "vitest";
import { parseTranslation, formatSenses } from "./parseTranslation";

describe("parseTranslation", () => {
  it("空字符串返回空 senses", () => {
    expect(parseTranslation("")).toEqual({ senses: [] });
    expect(parseTranslation("  \n  ")).toEqual({ senses: [] });
  });

  it("新格式：每行一个义项，解析词性/中文/英文", () => {
    expect(
      parseTranslation("v. 吐（口水）；喷出 — to force liquid from the mouth\nn. 口水；唾沫 — liquid in the mouth")
    ).toEqual({
      senses: [
        { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
        { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
      ],
    });
  });

  it("旧格式：首行为英文释义，其余为中文翻译", () => {
    expect(parseTranslation("a round fruit\n苹果")).toEqual({
      senses: [{ pos: "", chinese: "苹果", english: "a round fruit" }],
    });
  });

  it("旧格式：多行中文合并到同一义项", () => {
    expect(parseTranslation("a round fruit\n苹果\n一种水果")).toEqual({
      senses: [{ pos: "", chinese: "苹果\n一种水果", english: "a round fruit" }],
    });
  });

  it("单行中文作为中文翻译", () => {
    expect(parseTranslation("苹果")).toEqual({
      senses: [{ pos: "", chinese: "苹果", english: "" }],
    });
  });

  it("单行英文作为英文释义", () => {
    expect(parseTranslation("a round fruit")).toEqual({
      senses: [{ pos: "", chinese: "", english: "a round fruit" }],
    });
  });

  it("去除多余空白", () => {
    expect(parseTranslation("  v. 吐  — to spit \n 苹果 ")).toEqual({
      senses: [
        { pos: "v.", chinese: "吐", english: "to spit" },
        { pos: "", chinese: "苹果", english: "" },
      ],
    });
  });
});

describe("formatSenses", () => {
  it("格式化义项数组为每行一个义项", () => {
    expect(
      formatSenses([
        { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
        { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
      ])
    ).toBe("v. 吐（口水）；喷出 — to force liquid from the mouth\nn. 口水；唾沫 — liquid in the mouth");
  });

  it("空词性/空英文时省略对应部分", () => {
    expect(formatSenses([{ pos: "", chinese: "苹果", english: "a round fruit" }])).toBe("苹果 — a round fruit");
    expect(formatSenses([{ pos: "", chinese: "苹果", english: "" }])).toBe("苹果");
    expect(formatSenses([{ pos: "", chinese: "", english: "a round fruit" }])).toBe("a round fruit");
  });

  it("空数组返回空字符串", () => {
    expect(formatSenses([])).toBe("");
  });

  it("formatSenses 输出可被 parseTranslation 往返解析", () => {
    const senses = [
      { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
      { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
    ];
    expect(parseTranslation(formatSenses(senses))).toEqual({ senses });
  });
});
