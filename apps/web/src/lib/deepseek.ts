const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 300;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class DeepSeekError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DeepSeekError";
    this.status = status;
  }
}

function getConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError("DEEPSEEK_API_KEY 未配置", 500);
  }
  const baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  return { apiKey, baseUrl, model };
}

export interface ChatCompletionOptions {
  temperature?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

async function requestCompletion(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  temperature: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new DeepSeekError("AI 服务响应超时，请稍后重试", 504);
    }
    throw new DeepSeekError("调用 AI 服务失败，请稍后重试", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatCompletionJson<T>(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<T> {
  const { apiKey, baseUrl, model } = getConfig();
  const temperature = options?.temperature ?? 0.7;

  let response: Response | null = null;
  let lastError: DeepSeekError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS);
    }

    let candidate: Response;
    try {
      candidate = await requestCompletion(
        apiKey,
        baseUrl,
        model,
        messages,
        temperature
      );
    } catch (error) {
      lastError =
        error instanceof DeepSeekError
          ? error
          : new DeepSeekError("调用 AI 服务失败，请稍后重试", 502);
      if (lastError.status === 504) {
        break;
      }
      continue;
    }

    if (candidate.ok) {
      response = candidate;
      break;
    }

    if (!isRetryableStatus(candidate.status)) {
      throw new DeepSeekError("AI 服务返回错误，请稍后重试", 502);
    }
    lastError = new DeepSeekError("AI 服务返回错误，请稍后重试", 502);
  }

  if (!response) {
    throw lastError ?? new DeepSeekError("AI 服务返回错误，请稍后重试", 502);
  }

  let payload: {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new DeepSeekError("AI 服务返回格式无法解析", 502);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError("AI 服务返回内容为空", 502);
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new DeepSeekError("AI 服务返回格式无法解析", 502);
  }
}
