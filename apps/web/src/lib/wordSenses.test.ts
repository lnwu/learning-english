import { describe, it, expect } from "bun:test";
import {
  MAX_SENSES,
  chineseTranslations,
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
      })),
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

    expect(senses).toEqual([{ pos: "n.", chinese: "苹果", english: "a round fruit" }]);
  });

  it("规范化词性并折叠字段内空白", () => {
    expect(
      sanitizeWordSenses([
        { pos: "n", chinese: "  嘴\n口  ", english: "the part\nof the face" },
        { pos: "adj. / adv.", chinese: "口—嘴", english: "x" },
      ]),
    ).toEqual([
      { pos: "n.", chinese: "嘴 口", english: "the part of the face" },
      { pos: "adj.", chinese: "口 嘴", english: "x" },
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

  it("解析英文在前的新格式", () => {
    expect(
      decodeSenses(
        "v. to force liquid from the mouth — 吐（口水）；喷出\nn. liquid in the mouth — 口水；唾沫",
      ),
    ).toEqual([
      { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
      { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
    ]);
  });

  it("按是否含中日韩字符兼容旧的中文在前格式", () => {
    expect(decodeSenses("v. 吐（口水）；喷出 — to force liquid from the mouth")).toEqual([
      { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
    ]);
  });

  it("容忍不带句点的词性并去除多余空白", () => {
    expect(decodeSenses("  v to spit — 吐 ")).toEqual([
      { pos: "v", chinese: "吐", english: "to spit" },
    ]);
  });

  it("忽略历史释义里的区分说明行", () => {
    expect(
      decodeSenses("v. to make a copy — 复制\n区分：多用于文件，强调与原物一致\nn. a copy — 副本"),
    ).toEqual([
      { pos: "v.", chinese: "复制", english: "to make a copy" },
      { pos: "n.", chinese: "副本", english: "a copy" },
    ]);
  });
});

describe("encodeSenses", () => {
  it("每行一个义项，英文在前", () => {
    expect(
      encodeSenses([
        { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
        { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
      ]),
    ).toBe(
      "v. to force liquid from the mouth — 吐（口水）；喷出\nn. liquid in the mouth — 口水；唾沫",
    );
  });

  it("空词性/空英文时省略对应部分", () => {
    expect(encodeSenses([{ pos: "", chinese: "苹果", english: "a round fruit" }])).toBe(
      "a round fruit — 苹果",
    );
    expect(encodeSenses([{ pos: "", chinese: "苹果", english: "" }])).toBe("苹果");
    expect(encodeSenses([{ pos: "", chinese: "", english: "a round fruit" }])).toBe(
      "a round fruit",
    );
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

describe("chineseTranslations", () => {
  it("只拼接中文译法", () => {
    expect(
      chineseTranslations("n. the part of the face — 嘴\nn. the opening of a river — 河口"),
    ).toBe("嘴、河口");
  });

  it("解析失败时返回空字符串", () => {
    expect(chineseTranslations("apple")).toBe("");
  });
});
