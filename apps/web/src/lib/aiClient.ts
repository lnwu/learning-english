import { APICallError, generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { resolveAiModel, type AiModelSpec } from "@/lib/aiProviders";

const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 300;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
  }
}

const providerCache = new Map<string, (model: string) => LanguageModel>();

const getModelFactory = (spec: AiModelSpec): ((model: string) => LanguageModel) => {
  const apiKey = process.env[spec.apiKeyEnv];
  if (!apiKey) {
    throw new AiServiceError(`${spec.apiKeyEnv} 未配置`, 500);
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

const toServiceError = (error: unknown): AiServiceError => {
  if (error instanceof AiServiceError) return error;
  if (error instanceof APICallError) {
    return new AiServiceError("AI 服务返回错误，请稍后重试", 502);
  }
  return new AiServiceError("调用 AI 服务失败，请稍后重试", 502);
};

const isRetryableError = (error: unknown): boolean => {
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
}

interface RequestSettings {
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

async function requestWithRetry(
  spec: AiModelSpec,
  messages: ChatMessage[],
  settings: RequestSettings,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce(spec, messages, settings);
    } catch (error) {
      if (!isRetryableError(error) || attempt >= MAX_ATTEMPTS - 1) {
        throw toServiceError(error);
      }
    }
    await sleep(RETRY_DELAY_MS);
  }
}

async function requestOnce(
  spec: AiModelSpec,
  messages: ChatMessage[],
  { temperature, maxOutputTokens, timeoutMs }: RequestSettings,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { instructions, conversation } = splitSystemMessages(messages);

  try {
    const result = await generateText({
      model: getModelFactory(spec)(spec.model),
      instructions: instructions || undefined,
      messages: conversation,
      temperature: spec.supportsTemperature ? temperature : undefined,
      reasoning: spec.reasoning,
      maxOutputTokens,
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    return result.text;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiServiceError("AI 服务响应超时，请稍后重试", 504);
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
  });

  if (!text.trim()) {
    throw new AiServiceError("AI 服务返回内容为空", 502);
  }

  try {
    return JSON.parse(extractJson(text)) as T;
  } catch {
    throw new AiServiceError("AI 服务返回格式无法解析", 502);
  }
}
