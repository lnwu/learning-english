import { describe, it, expect } from "bun:test";
import { translations, t, formatMessage, type TranslationKey } from "./i18n";

describe("i18n", () => {
  it("en 表与 zh 表的 key 完全一致", () => {
    const zhKeys = Object.keys(translations.zh).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it("占位符 key 都包含同名变量", () => {
    const placeholderKeys = (Object.keys(translations.zh) as TranslationKey[]).filter((key) =>
      /\{\w+\}/.test(translations.zh[key])
    );
    expect(placeholderKeys.length).toBeGreaterThan(0);
    for (const key of placeholderKeys) {
      const names = (text: string) =>
        Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1]).sort();
      expect(names(translations.en[key])).toEqual(names(translations.zh[key]));
    }
  });

  it("t 支持参数替换", () => {
    expect(
      t("profile.deleteConfirm", "zh", { word: "apple" })
    ).toBe("确定删除「apple」吗？");
    expect(t("profile.deleteConfirm", "en", { word: "apple" })).toBe(
      'Delete "apple"?'
    );
  });

  it("t 支持多参数替换", () => {
    const result = t("profile.regeneratePartial", "zh", {
      success: 3,
      skipped: 2,
    });
    expect(result).toBe("已重新生成 3 个单词的释义，2 个保留原释义");
  });

  it("formatMessage 未知占位符原样保留", () => {
    expect(formatMessage("hello {name} {unknown}", { name: "world" })).toBe(
      "hello world {unknown}"
    );
  });
});
