import { NextResponse } from "next/server";
import { t, type Locale, type TranslationKey } from "@/lib/i18n";

export const API_ERROR_KEYS = {
  invalidJson: "api.invalidJson",
  inputTooLong: "api.inputTooLong",
  invalidWord: "api.invalidWord",
  unknownModel: "api.unknownModel",
  missingModel: "api.missingModel",
  tooManyModels: "api.tooManyModels",
  missingWords: "api.missingWords",
  missingSentence: "api.missingSentence",
  missingLogEntries: "api.missingLogEntries",
  tooManyLogEntries: "api.tooManyLogEntries",
  unknownLogEvent: "api.unknownLogEvent",
  incompleteLogEntry: "api.incompleteLogEntry",
  notAuthenticated: "error.notAuthenticated",
  invalidSession: "api.invalidSession",
  authFailed: "api.authFailed",
  serverMisconfigured: "api.serverMisconfigured",
  rateLimited: "api.rateLimited",
  aiCallFailed: "api.aiCallFailed",
  aiTimeout: "api.aiTimeout",
  aiEmptyResponse: "api.aiEmptyResponse",
  aiParseError: "api.aiParseError",
  aiError: "api.aiError",
  modelDisabled: "api.modelDisabled",
  translateFailed: "api.translateFailed",
  compareFailed: "senses.compareFailed",
  sentenceGenerateFailed: "sentence.generateFailed",
  sentenceCheckFailed: "sentence.checkFailed",
  logReportFailed: "api.logReportFailed",
  requestFailed: "error.requestFailed",
} as const satisfies Record<string, TranslationKey>;

export type ApiErrorCode = keyof typeof API_ERROR_KEYS;

export const isApiErrorCode = (value: unknown): value is ApiErrorCode =>
  typeof value === "string" && Object.hasOwn(API_ERROR_KEYS, value);

export const readApiErrorCode = (body: unknown): ApiErrorCode | null => {
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { code?: unknown }).code;
  return isApiErrorCode(code) ? code : null;
};

export const apiErrorText = (code: ApiErrorCode, locale: Locale = "zh"): string =>
  t(API_ERROR_KEYS[code], locale);

export const apiErrorBody = (
  code: ApiErrorCode,
  extra?: Record<string, unknown>,
): { code: ApiErrorCode; error: string } & Record<string, unknown> => ({
  code,
  error: apiErrorText(code),
  ...extra,
});

export const apiErrorResponse = (
  code: ApiErrorCode,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse => NextResponse.json(apiErrorBody(code, extra), { status });
