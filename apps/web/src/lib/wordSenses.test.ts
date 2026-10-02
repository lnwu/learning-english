import { describe, it, expect } from "bun:test";
import {
  MAX_NOTE_LENGTH,
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

  it("非数组输入返回空数组", () => {
    expect(sanitizeWordSenses(null)).toEqual([]);
    expect(sanitizeWordSenses("bad")).toEqual([]);
  });

  it("保留合法区分并折叠空白", () => {
    const senses = sanitizeWordSenses([
      {
        pos: "v.",
        chinese: "复制",
        english: "to make a copy",
        note: "  多用于文件或记录，\n强调与原物完全一致  ",
      },
    ]);

    expect(senses).toEqual([
      {
        pos: "v.",
        chinese: "复制",
        english: "to make a copy",
        note: "多用于文件或记录， 强调与原物完全一致",
      },
    ]);
  });

  it("超长或空区分只丢弃区分，保留义项", () => {
    const senses = sanitizeWordSenses([
      {
        pos: "v.",
        chinese: "复制",
        english: "to make a copy",
        note: "x".repeat(MAX_NOTE_LENGTH + 1),
      },
      { pos: "n.", chinese: "副本", english: "a copy", note: "   " },
    ]);

    expect(senses).toEqual([
      { pos: "v.", chinese: "复制", english: "to make a copy" },
      { pos: "n.", chinese: "副本", english: "a copy" },
    ]);
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
        "v. 吐（口水）；喷出 — to force liquid from the mouth\nn. 口水；唾沫 — liquid in the mouth",
      ),
    ).toEqual([
      { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
      { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
    ]);
  });

  it("去除多余空白", () => {
    expect(decodeSenses("  v. 吐  — to spit ")).toEqual([
      { pos: "v.", chinese: "吐", english: "to spit" },
    ]);
  });

  it("识别 区分：与 辨析： 前缀的说明行", () => {
    expect(decodeSenses("v. 复制 — to make a copy\n辨析：多用于文件，强调与原物一致")).toEqual([
      {
        pos: "v.",
        chinese: "复制",
        english: "to make a copy",
        note: "多用于文件，强调与原物一致",
      },
    ]);
  });

  it("区分行归属于上一个义项", () => {
    expect(
      decodeSenses("v. 复制 — to make a copy\n区分：多用于文件，强调与原物一致\nn. 副本 — a copy"),
    ).toEqual([
      {
        pos: "v.",
        chinese: "复制",
        english: "to make a copy",
        note: "多用于文件，强调与原物一致",
      },
      { pos: "n.", chinese: "副本", english: "a copy" },
    ]);
  });

  it("没有前置义项的区分行被忽略", () => {
    expect(decodeSenses("区分：孤立说明\nv. 吐 — to spit")).toEqual([
      { pos: "v.", chinese: "吐", english: "to spit" },
    ]);
  });
});

describe("encodeSenses", () => {
  it("每行一个义项", () => {
    expect(
      encodeSenses([
        { pos: "v.", chinese: "吐（口水）；喷出", english: "to force liquid from the mouth" },
        { pos: "n.", chinese: "口水；唾沫", english: "liquid in the mouth" },
      ]),
    ).toBe(
      "v. 吐（口水）；喷出 — to force liquid from the mouth\nn. 口水；唾沫 — liquid in the mouth",
    );
  });

  it("空词性/空英文时省略对应部分", () => {
    expect(encodeSenses([{ pos: "", chinese: "苹果", english: "a round fruit" }])).toBe(
      "苹果 — a round fruit",
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

  it("有区分时在义项下另起一行，且可无损还原", () => {
    const senses: WordSense[] = [
      {
        pos: "v.",
        chinese: "复制",
        english: "to make an exact copy",
        note: "多用于文件或记录，强调与原物完全一致",
      },
      { pos: "n.", chinese: "副本", english: "a copy" },
    ];

    expect(encodeSenses(senses)).toBe(
      "v. 复制 — to make an exact copy\n区分：多用于文件或记录，强调与原物完全一致\nn. 副本 — a copy",
    );
    expect(decodeSenses(encodeSenses(senses))).toEqual(senses);
  });
});
