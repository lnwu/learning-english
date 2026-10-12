import { APICallError, generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { resolveAiModel, type AiModelSpec, type AiReasoning } from "@/lib/aiProviders";
import { createLogger, nowMs, type LogFields } from "@/lib/log";

const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 300;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const MAX_RESPONSE_BODY_LOG_LENGTH = 500;

const log = createLogger({ mod: "ai" });

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AiErrorDetails {
  provider?: string;
  statusCode?: number;
  responseBody?: string;
  url?: string;
  timedOut?: boolean;
  attempts?: number;
}

export class AiServiceError extends Error {
  status: number;
  provider?: string;
  statusCode?: number;
  responseBody?: string;
  url?: string;
  timedOut?: boolean;
  attempts?: number;

  constructor(message: string, status: number, details: AiErrorDetails = {}) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
    this.provider = details.provider;
    this.statusCode = details.statusCode;
    this.responseBody = details.responseBody;
    this.url = details.url;
    this.timedOut = details.timedOut;
    this.attempts = details.attempts;
  }
}

interface AiAttemptUsage {
  finishReason: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  reasoningTokens: number | undefined;
}

interface AiAttemptResult extends AiAttemptUsage {
  text: string;
}

type AiOutcome =
  | "timeout"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "empty_response"
  | "parse_error"
  | "unknown";

class EmptyResponseError extends Error {
  usage: AiAttemptUsage;

  constructor(message: string, usage: AiAttemptUsage) {
    super(message);
    this.name = "EmptyResponseError";
    this.usage = usage;
  }
}

const providerCache = new Map<string, (model: string) => LanguageModel>();

const getModelFactory = (spec: AiModelSpec): ((model: string) => LanguageModel) => {
  const apiKey = process.env[spec.apiKeyEnv];
  if (!apiKey) {
    throw new AiServiceError(`${spec.apiKeyEnv} 未配置`, 500, { provider: spec.provider });
  }

  const cacheKey = `${spec.sdk}:${spec.baseUrl}:${spec.apiKeyEnv}`;
  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  let factory: (model: string) => LanguageModel;
  switch (spec.sdk) {
    case "anthropic": {
      const provider = createAnthropic({ baseURL: spec.baseUrl, apiKey });
      factory = (model) => provider(model);
      break;
    }
    case "google": {
      const provider = createGoogleGenerativeAI({ baseURL: spec.baseUrl, apiKey });
      factory = (model) => provider(model);
      break;
    }
    case "openai-compatible": {
      const provider = createOpenAICompatible({
        name: spec.provider,
        baseURL: spec.baseUrl,
        apiKey,
      });
      factory = (model) => provider.chatModel(model);
      break;
    }
  }

  providerCache.set(cacheKey, factory);
  return factory;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

const classifyAiOutcome = (error: unknown): AiOutcome => {
  if (error instanceof EmptyResponseError) return "empty_response";
  if (error instanceof AiServiceError) return error.timedOut ? "timeout" : "unknown";
  if (error instanceof APICallError) {
    if (error.statusCode === 429) return "rate_limited";
    if (typeof error.statusCode === "number") {
      return error.statusCode >= 500 ? "server_error" : "unknown";
    }
    return "network_error";
  }
  return "unknown";
};

const toServiceError = (error: unknown, spec: AiModelSpec, attempts: number): AiServiceError => {
  if (error instanceof AiServiceError) {
    error.provider ??= spec.provider;
    error.attempts ??= attempts;
    return error;
  }
  if (error instanceof EmptyResponseError) {
    return new AiServiceError(error.message, 502, { provider: spec.provider, attempts });
  }
  if (error instanceof APICallError) {
    return new AiServiceError("AI 服务返回错误，请稍后重试", 502, {
      provider: spec.provider,
      statusCode: error.statusCode,
      responseBody:
        typeof error.responseBody === "string"
          ? error.responseBody.slice(0, MAX_RESPONSE_BODY_LOG_LENGTH)
          : undefined,
      url: error.url,
      attempts,
    });
  }
  return new AiServiceError("调用 AI 服务失败，请稍后重试", 502, {
    provider: spec.provider,
    attempts,
  });
};

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof EmptyResponseError) return true;
  if (error instanceof AiServiceError) return false;
  if (error instanceof APICallError) {
    return error.statusCode === undefined || isRetryableStatus(error.statusCode);
  }
  return true;
};

const splitSystemMessages = (
  messages: ChatMessage[],
): { instructions: string | undefined; conversation: ChatMessage[] } => ({
  instructions: messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n"),
  conversation: messages.filter((message) => message.role !== "system"),
});

export const extractJson = (text: string): string => {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
};

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  reasoning?: AiReasoning | "none";
}

interface RequestSettings {
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  reasoning?: AiReasoning | "none";
}

const aiFields = (spec: AiModelSpec): LogFields => ({
  provider: spec.provider,
  providerName: spec.providerName,
  model: spec.model,
  sdk: spec.sdk,
});

const logAttempt = (
  spec: AiModelSpec,
  input: {
    attempt: number;
    durationMs: number;
    timeoutMs: number;
    outcome: AiOutcome | "ok";
    willRetry: boolean;
    result: AiAttemptResult | undefined;
    failure: unknown;
  },
): void => {
  const fields: LogFields = {
    ...aiFields(spec),
    attempt: input.attempt,
    maxAttempts: MAX_ATTEMPTS,
    durationMs: input.durationMs,
    timeoutMs: input.timeoutMs,
    outcome: input.outcome,
    willRetry: input.willRetry,
  };

  const usage =
    input.result ?? (input.failure instanceof EmptyResponseError ? input.failure.usage : undefined);
  if (usage) {
    if (usage.finishReason) fields.finishReason = usage.finishReason;
    if (typeof usage.inputTokens === "number") fields.inputTokens = usage.inputTokens;
    if (typeof usage.outputTokens === "number") fields.outputTokens = usage.outputTokens;
    if (typeof usage.reasoningTokens === "number") fields.reasoningTokens = usage.reasoningTokens;
  }

  const statusCode = input.failure instanceof APICallError ? input.failure.statusCode : undefined;
  if (typeof statusCode === "number") fields.statusCode = statusCode;

  if (input.result) {
    log.info("ai.call", "AI call completed", fields);
    return;
  }
  log.warn("ai.call", "AI call failed", fields, input.failure);
};

async function requestWithRetry(
  spec: AiModelSpec,
  messages: ChatMessage[],
  settings: RequestSettings,
): Promise<string> {
  const startedAt = nowMs();

  for (let attempt = 0; ; attempt++) {
    const attemptStartedAt = nowMs();
    let result: AiAttemptResult | undefined;
    let failure: unknown;

    try {
      result = await requestOnce(spec, messages, settings);
    } catch (error) {
      failure = error;
    }

    const outcome: AiOutcome | "ok" = failure === undefined ? "ok" : classifyAiOutcome(failure);
    const willRetry =
      failure !== undefined && isRetryableError(failure) && attempt < MAX_ATTEMPTS - 1;

    logAttempt(spec, {
      attempt: attempt + 1,
      durationMs: Math.round(nowMs() - attemptStartedAt),
      timeoutMs: settings.timeoutMs,
      outcome,
      willRetry,
      result,
      failure,
    });

    const summary: LogFields = {
      ...aiFields(spec),
      totalMs: Math.round(nowMs() - startedAt),
      attempts: attempt + 1,
      outcome,
    };

    if (failure === undefined && result) {
      log.info("ai.call.summary", "AI call completed", summary);
      return result.text;
    }

    if (!willRetry) {
      const serviceError = toServiceError(failure, spec, attempt + 1);
      log.error(
        "ai.call.summary",
        "AI call failed",
        { ...summary, apiStatus: serviceError.status },
        serviceError,
      );
      throw serviceError;
    }

    await sleep(RETRY_DELAY_MS);
  }
}

async function requestOnce(
  spec: AiModelSpec,
  messages: ChatMessage[],
  { temperature, maxOutputTokens, timeoutMs, reasoning }: RequestSettings,
): Promise<AiAttemptResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { instructions, conversation } = splitSystemMessages(messages);

  try {
    const result = await generateText({
      model: getModelFactory(spec)(spec.model),
      instructions: instructions || undefined,
      messages: conversation,
      temperature: spec.supportsTemperature ? temperature : undefined,
      reasoning: spec.reasoning === undefined ? undefined : (reasoning ?? spec.reasoning),
      maxOutputTokens,
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    const usage: AiAttemptUsage = {
      finishReason: result.finishReason,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens,
    };
    if (!result.text.trim()) {
      throw new EmptyResponseError("AI 服务返回内容为空", usage);
    }
    return { text: result.text, ...usage };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiServiceError("AI 服务响应超时，请稍后重试", 504, {
        provider: spec.provider,
        timedOut: true,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatCompletionJson<T>(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<T> {
  const spec = resolveAiModel(options?.model);
  if (!spec) {
    throw new AiServiceError("未知模型", 400);
  }

  const text = await requestWithRetry(spec, messages, {
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
    reasoning: options?.reasoning,
  });

  if (!text.trim()) {
    throw new AiServiceError("AI 服务返回内容为空", 502, { provider: spec.provider });
  }

  try {
    return JSON.parse(extractJson(text)) as T;
  } catch (error) {
    log.warn(
      "ai.call",
      "AI call returned unparsable JSON",
      { ...aiFields(spec), outcome: "parse_error", textLength: text.length },
      error,
    );
    throw new AiServiceError("AI 服务返回格式无法解析", 502, { provider: spec.provider });
  }
}
