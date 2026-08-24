const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const REQUEST_TIMEOUT_MS = 30000;

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

export async function chatCompletionJson<T>(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<T> {
  const { apiKey, baseUrl, model } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new DeepSeekError("调用 AI 服务失败，请稍后重试", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new DeepSeekError("AI 服务返回错误，请稍后重试", 502);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError("AI 服务返回内容为空", 502);
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new DeepSeekError("AI 服务返回格式无法解析", 502);
  }
}
