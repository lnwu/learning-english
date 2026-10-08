import { NextResponse } from "next/server";
import { isAiModelId } from "@/lib/aiProviders";
import type { ApiParseResult } from "@/lib/apiRoute";
import { isValidWordToken } from "@/lib/lemma";
import { sanitizeWordSenses, type WordSense } from "@/lib/wordSenses";

type ApiField<T> = { ok: true; value: T } | { ok: false; error: string };

export type FieldParser<T> = (raw: unknown) => ApiField<T>;

export const badRequest = (error: string): NextResponse =>
  NextResponse.json({ error }, { status: 400 });

export const requiredText =
  (options: { maxLength: number; message: string }): FieldParser<string> =>
  (raw) => {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return { ok: false, error: options.message };
    if (value.length > options.maxLength) {
      return { ok: false, error: "输入内容过长" };
    }
    return { ok: true, value };
  };

export const optionalText =
  (maxLength: number): FieldParser<string> =>
  (raw) => {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length > maxLength) {
      return { ok: false, error: "输入内容过长" };
    }
    return { ok: true, value };
  };

export const wordToken = (): FieldParser<string> => (raw) => {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isValidWordToken(value) ? { ok: true, value } : { ok: false, error: "无效单词" };
};

export const wordTokenList =
  (options: { maxItems: number }): FieldParser<string[]> =>
  (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, error: "无效单词列表" };
    }
    if (raw.length > options.maxItems) {
      return { ok: false, error: "单词数量过多" };
    }

    const words: string[] = [];
    for (const item of raw) {
      const word = typeof item === "string" ? item.trim().toLowerCase() : "";
      if (isValidWordToken(word)) words.push(word);
    }

    const unique = Array.from(new Set(words));
    if (unique.length === 0) {
      return { ok: false, error: "无效单词列表" };
    }
    return { ok: true, value: unique };
  };

export const wordList =
  (options: { maxItems: number; maxItemLength: number }): FieldParser<string[]> =>
  (raw) => {
    const values = Array.isArray(raw)
      ? raw
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, options.maxItems)
      : [];

    if (values.some((value) => value.length > options.maxItemLength)) {
      return { ok: false, error: "输入内容过长" };
    }
    return { ok: true, value: values };
  };

export const wordSenseList = (): FieldParser<WordSense[]> => (raw) => {
  const senses = sanitizeWordSenses(raw);
  return senses.length > 0 ? { ok: true, value: senses } : { ok: false, error: "无效义项" };
};

export interface SentenceWordInput {
  word: string;
  translation: string;
}

export const sentenceWordList =
  (options: {
    maxItems: number;
    maxWordLength: number;
    maxTranslationLength: number;
  }): FieldParser<SentenceWordInput[]> =>
  (raw) => {
    const items = Array.isArray(raw)
      ? raw
          .map((item) => {
            const record = (item ?? {}) as {
              word?: unknown;
              translation?: unknown;
            };
            return {
              word: typeof record.word === "string" ? record.word.trim() : "",
              translation: typeof record.translation === "string" ? record.translation.trim() : "",
            };
          })
          .filter((item) => item.word)
          .slice(0, options.maxItems)
      : [];

    const hasOverlongItem = items.some(
      (item) =>
        item.word.length > options.maxWordLength ||
        item.translation.length > options.maxTranslationLength,
    );
    if (hasOverlongItem) {
      return { ok: false, error: "输入内容过长" };
    }
    return { ok: true, value: items };
  };

export const optionalAiModelId = (): FieldParser<string> => (raw) => {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: "" };
  if (typeof raw !== "string" || !isAiModelId(raw.trim())) {
    return { ok: false, error: "未知模型" };
  }
  return { ok: true, value: raw.trim() };
};

export const aiModelIdList =
  (options: { maxItems: number }): FieldParser<string[]> =>
  (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, error: "缺少模型" };
    }
    const models = Array.from(
      new Set(raw.map((item) => (typeof item === "string" ? item.trim() : ""))),
    ).filter(Boolean);
    if (models.length === 0) {
      return { ok: false, error: "缺少模型" };
    }
    if (models.length > options.maxItems) {
      return { ok: false, error: "模型数量过多" };
    }
    if (models.some((model) => !isAiModelId(model))) {
      return { ok: false, error: "未知模型" };
    }
    return { ok: true, value: models };
  };

export const parseBody =
  <T extends Record<string, unknown>>(parsers: {
    [K in keyof T]: FieldParser<T[K]>;
  }): ((raw: unknown) => ApiParseResult<T>) =>
  (raw) => {
    const source = (raw ?? {}) as Record<string, unknown>;
    const body = {} as T;

    for (const key of Object.keys(parsers) as Array<keyof T>) {
      const result = parsers[key](source[String(key)]);
      if (!result.ok) {
        return { ok: false, response: badRequest(result.error) };
      }
      body[key] = result.value;
    }

    return { ok: true, body };
  };
