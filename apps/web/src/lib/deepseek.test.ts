import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { chatCompletionJson, DeepSeekError } from "./deepseek";

const originalFetch = globalThis.fetch;
const originalKey = process.env.DEEPSEEK_API_KEY;

const completionResponse = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
  });

describe("chatCompletionJson", () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalKey;
    }
  });

  it("解析 JSON 返回内容", async () => {
    globalThis.fetch = (async () =>
      completionResponse('{"ok":true}')) as unknown as typeof fetch;
    const result = await chatCompletionJson<{ ok: boolean }>([
      { role: "user", content: "hi" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("非 JSON 响应抛出 502", async () => {
    globalThis.fetch = (async () =>
      new Response("<html>bad gateway</html>", {
        status: 200,
      })) as unknown as typeof fetch;
    const error = await chatCompletionJson([
      { role: "user", content: "hi" },
    ]).catch((caught) => caught);
    expect(error).toBeInstanceOf(DeepSeekError);
    expect((error as DeepSeekError).status).toBe(502);
  });

  it("网络错误重试一次后成功", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) throw new Error("network down");
      return completionResponse('{"ok":1}');
    }) as unknown as typeof fetch;

    const result = await chatCompletionJson<{ ok: number }>([
      { role: "user", content: "hi" },
    ]);
    expect(result.ok).toBe(1);
    expect(calls).toBe(2);
  });

  it("服务端 5xx 重试一次后成功", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("{}", { status: 500 });
      return completionResponse('{"ok":2}');
    }) as unknown as typeof fetch;

    const result = await chatCompletionJson<{ ok: number }>([
      { role: "user", content: "hi" },
    ]);
    expect(result.ok).toBe(2);
    expect(calls).toBe(2);
  });

  it("400 不重试直接失败", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 400 });
    }) as unknown as typeof fetch;

    const error = await chatCompletionJson([
      { role: "user", content: "hi" },
    ]).catch((caught) => caught);
    expect(error).toBeInstanceOf(DeepSeekError);
    expect(calls).toBe(1);
  });

  it("未配置 API key 抛出 500", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const error = await chatCompletionJson([
      { role: "user", content: "hi" },
    ]).catch((caught) => caught);
    expect(error).toBeInstanceOf(DeepSeekError);
    expect((error as DeepSeekError).status).toBe(500);
  });
});
