import { describe, it, expect, jest } from "bun:test";
import { chatCompletionJson, extractJson, AiServiceError } from "./aiClient";
import { useEnvVar, useRestoredFetch } from "./testSupport";

const openAiResponse = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

const anthropicResponse = (text: string, status = 200) =>
  new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status },
  );

const googleResponse = (text: string, status = 200) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    }),
    { status },
  );

const messages = [
  { role: "system" as const, content: "只返回 JSON" },
  { role: "user" as const, content: "hi" },
];

const captureRequest = (response: Response) => {
  const captured: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return response;
  }) as unknown as typeof fetch;
  return captured;
};

const stalledFetch = () => {
  const state = { calls: 0 };
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    state.calls += 1;
    return new Promise((_resolve, reject) => {
      if (init.signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  }) as unknown as typeof fetch;
  return state;
};

describe("chatCompletionJson", () => {
  useEnvVar("DEEPSEEK_API_KEY", "test-key");
  useRestoredFetch();

  it("解析 JSON 返回内容", async () => {
    globalThis.fetch = (async () => openAiResponse('{"ok":true}')) as unknown as typeof fetch;
    const result = await chatCompletionJson<{ ok: boolean }>(messages);
    expect(result.ok).toBe(true);
  });

  it("system 消息经 instructions 下发而不报 prompt 错误", async () => {
    const captured = captureRequest(openAiResponse('{"ok":true}'));
    const result = await chatCompletionJson<{ ok: boolean }>(messages);
    expect(result.ok).toBe(true);
    expect(JSON.parse(String(captured.init?.body)).messages).toEqual([
      { role: "system", content: "只返回 JSON" },
      { role: "user", content: "hi" },
    ]);
  });

  it("解析 markdown fence 包裹的 JSON", async () => {
    globalThis.fetch = (async () =>
      openAiResponse('```json\n{"ok":true}\n```')) as unknown as typeof fetch;
    const result = await chatCompletionJson<{ ok: boolean }>(messages);
    expect(result.ok).toBe(true);
  });

  it("非 JSON 响应抛出 502", async () => {
    globalThis.fetch = (async () =>
      openAiResponse("抱歉，我无法完成这个请求")) as unknown as typeof fetch;
    const error = await chatCompletionJson(messages).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).status).toBe(502);
  });

  const failureModes: Array<[string, () => Promise<Response>]> = [
    ["网络错误", () => Promise.reject(new Error("network down"))],
    ["服务端 5xx", async () => new Response("{}", { status: 500 })],
    ["服务端 429", async () => new Response("{}", { status: 429 })],
    ["空内容响应", async () => openAiResponse("")],
  ];

  it.each(failureModes)("%s 后重试一次成功", async (_label, failFirst) => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? failFirst() : openAiResponse('{"ok":1}');
    }) as unknown as typeof fetch;

    const result = await chatCompletionJson<{ ok: number }>(messages);
    expect(result.ok).toBe(1);
    expect(calls).toBe(2);
  });

  it("请求超时（504）不重试", async () => {
    jest.useFakeTimers();
    const state = stalledFetch();

    try {
      const pending = chatCompletionJson(messages).catch((caught) => caught);
      jest.advanceTimersByTime(31_000);
      const error = await pending;
      expect(error).toBeInstanceOf(AiServiceError);
      expect((error as AiServiceError).status).toBe(504);
      expect(state.calls).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("timeoutMs 覆盖默认的 30 秒预算", async () => {
    jest.useFakeTimers();
    const state = stalledFetch();

    try {
      const pending = chatCompletionJson(messages, { timeoutMs: 5_000 }).catch((caught) => caught);
      jest.advanceTimersByTime(5_000);
      const error = await pending;
      expect(error).toBeInstanceOf(AiServiceError);
      expect((error as AiServiceError).status).toBe(504);
      expect(state.calls).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("空内容重试耗尽后抛出 502", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return openAiResponse("  \n  ");
    }) as unknown as typeof fetch;

    const error = await chatCompletionJson(messages).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).status).toBe(502);
    expect((error as Error).message).toBe("AI 服务返回内容为空");
    expect(calls).toBe(2);
  });

  it("400 不重试直接失败", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 400 });
    }) as unknown as typeof fetch;

    const error = await chatCompletionJson(messages).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiServiceError);
    expect(calls).toBe(1);
  });

  it("未配置 API key 抛出 500", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const error = await chatCompletionJson(messages).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).status).toBe(500);
  });

  it("未知模型抛出 400", async () => {
    const error = await chatCompletionJson(messages, { model: "unknown/model" }).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).status).toBe(400);
  });
});

describe("模型路由", () => {
  useEnvVar("DEEPSEEK_API_KEY", "test-key");
  useEnvVar("OPENCODE_API_KEY", "test-key");
  useEnvVar("MIMO_API_KEY", "test-key");
  useRestoredFetch();

  it("mimo 模型路由到 MiMo chat/completions", async () => {
    const captured = captureRequest(openAiResponse('{"ok":true}'));
    await chatCompletionJson(messages, { model: "mimo/mimo-v2.6-flash" });
    expect(captured.url).toBe("https://api.xiaomimimo.com/v1/chat/completions");
    expect(JSON.parse(String(captured.init?.body)).model).toBe("mimo-v2.6-flash");
  });

  it("claude 模型路由到 Zen messages 并按 Anthropic 格式解析", async () => {
    const captured = captureRequest(anthropicResponse('{"ok":true}'));
    const result = await chatCompletionJson<{ ok: boolean }>(messages, {
      model: "opencode/claude-sonnet-5-5",
    });
    expect(captured.url).toBe("https://opencode.ai/zen/v1/messages");
    expect(result.ok).toBe(true);
  });

  it("gemini 模型路由到 Zen models 并按 Google 格式解析", async () => {
    const captured = captureRequest(googleResponse('{"ok":true}'));
    const result = await chatCompletionJson<{ ok: boolean }>(messages, {
      model: "opencode/gemini-3.8-flash",
    });
    expect(captured.url).toBe("https://opencode.ai/zen/v1/models/gemini-3.8-flash:generateContent");
    expect(result.ok).toBe(true);
  });
});

describe("extractJson", () => {
  it("提取纯 JSON", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("提取 markdown fence 中的 JSON", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("提取夹杂文本中的 JSON 对象", () => {
    expect(extractJson('这是结果：{"a":1} 以上')).toBe('{"a":1}');
  });

  it("无 JSON 时原样返回", () => {
    expect(extractJson("不是 JSON")).toBe("不是 JSON");
  });
});
