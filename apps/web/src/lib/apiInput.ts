import type { NextResponse } from "next/server";
import { apiErrorResponse, type ApiErrorCode } from "@/lib/apiErrors";
import { isAiModelId } from "@/lib/aiProviders";
import type { ApiParseResult } from "@/lib/apiRoute";
import { isValidWordToken } from "@/lib/lemma";
import { isClientLogEvent, type LogEvent, type LogFields } from "@/lib/log";

type ApiField<T> = { ok: true; value: T } | { ok: false; code: ApiErrorCode };

export type FieldParser<T> = (raw: unknown) => ApiField<T>;

export const badRequest = (code: ApiErrorCode): NextResponse => apiErrorResponse(code, 400);

export const requiredText =
  (options: { maxLength: number; code: ApiErrorCode }): FieldParser<string> =>
  (raw) => {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return { ok: false, code: options.code };
    if (value.length > options.maxLength) {
      return { ok: false, code: "inputTooLong" };
    }
    return { ok: true, value };
  };

export const optionalText =
  (maxLength: number): FieldParser<string> =>
  (raw) => {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length > maxLength) {
      return { ok: false, code: "inputTooLong" };
    }
    return { ok: true, value };
  };

export const wordToken = (): FieldParser<string> => (raw) => {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isValidWordToken(value) ? { ok: true, value } : { ok: false, code: "invalidWord" };
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
      return { ok: false, code: "inputTooLong" };
    }
    return { ok: true, value: values };
  };

export const optionalBoolean = (): FieldParser<boolean> => (raw) => ({
  ok: true,
  value: raw === true,
});

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
      return { ok: false, code: "inputTooLong" };
    }
    return { ok: true, value: items };
  };

export const optionalAiModelId = (): FieldParser<string> => (raw) => {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: "" };
  if (typeof raw !== "string" || !isAiModelId(raw.trim())) {
    return { ok: false, code: "unknownModel" };
  }
  return { ok: true, value: raw.trim() };
};

export const aiModelIdList =
  (options: { maxItems: number }): FieldParser<string[]> =>
  (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, code: "missingModel" };
    }
    const models = Array.from(
      new Set(raw.map((item) => (typeof item === "string" ? item.trim() : ""))),
    ).filter(Boolean);
    if (models.length === 0) {
      return { ok: false, code: "missingModel" };
    }
    if (models.length > options.maxItems) {
      return { ok: false, code: "tooManyModels" };
    }
    if (models.some((model) => !isAiModelId(model))) {
      return { ok: false, code: "unknownModel" };
    }
    return { ok: true, value: models };
  };

export interface ClientLogEntryInput {
  event: LogEvent;
  level: "warn" | "error";
  message: string;
  fields: LogFields;
}

const isPrimitiveLogValue = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

export const clientLogEntries =
  (options: {
    maxItems: number;
    maxMessageLength: number;
    maxFieldCount: number;
    maxValueLength: number;
  }): FieldParser<ClientLogEntryInput[]> =>
  (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, code: "missingLogEntries" };
    }
    if (raw.length > options.maxItems) {
      return { ok: false, code: "tooManyLogEntries" };
    }

    const entries: ClientLogEntryInput[] = [];
    for (const item of raw) {
      const record = (item ?? {}) as Record<string, unknown>;
      const event = typeof record.event === "string" ? record.event : "";
      const message = typeof record.message === "string" ? record.message.trim() : "";
      const level = record.level === "error" ? "error" : record.level === "warn" ? "warn" : null;

      if (!isClientLogEvent(event)) return { ok: false, code: "unknownLogEvent" };
      if (!level || !message) return { ok: false, code: "incompleteLogEntry" };
      if (message.length > options.maxMessageLength) return { ok: false, code: "inputTooLong" };

      const fields: LogFields = {};
      const source = (record.fields ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(source)) {
        if (Object.keys(fields).length >= options.maxFieldCount) break;
        if (!isPrimitiveLogValue(value)) continue;
        fields[key] = typeof value === "string" ? value.slice(0, options.maxValueLength) : value;
      }
      entries.push({ event, level, message, fields });
    }

    return { ok: true, value: entries };
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
        return { ok: false, response: badRequest(result.code) };
      }
      body[key] = result.value;
    }

    return { ok: true, body };
  };
