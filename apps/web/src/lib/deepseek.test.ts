import { describe, it, expect, jest } from "bun:test";
import { chatCompletionJson, DeepSeekError } from "./deepseek";
import { useEnvVar, useRestoredFetch } from "./testSupport";

const completionResponse = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
  });

describe("chatCompletionJson", () => {
  useEnvVar("DEEPSEEK_API_KEY", "test-key");
  useRestoredFetch();

  it("解析 JSON 返回内容", async () => {
    globalThis.fetch = (async () => completionResponse('{"ok":true}')) as unknown as typeof fetch;
    const result = await chatCompletionJson<{ ok: boolean }>([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
  });

  it("非 JSON 响应抛出 502", async () => {
    globalThis.fetch = (async () =>
      new Response("<html>bad gateway</html>", {
        status: 200,
      })) as unknown as typeof fetch;
    const error = await chatCompletionJson([{ role: "user", content: "hi" }]).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(DeepSeekError);
    expect((error as DeepSeekError).status).toBe(502);
  });

  const failureModes: Array<[string, () => Promise<Response>]> = [
    ["网络错误", () => Promise.reject(new Error("network down"))],
    ["服务端 5xx", async () => new Response("{}", { status: 500 })],
    ["服务端 429", async () => new Response("{}", { status: 429 })],
  ];

  it.each(failureModes)("%s 后重试一次成功", async (_label, failFirst) => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? failFirst() : completionResponse('{"ok":1}');
    }) as unknown as typeof fetch;

    const result = await chatCompletionJson<{ ok: number }>([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(1);
    expect(calls).toBe(2);
  });

  it("请求超时（504）不重试", async () => {
    jest.useFakeTimers();
    let calls = 0;
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }) as unknown as typeof fetch;

    try {
      const pending = chatCompletionJson([{ role: "user", content: "hi" }]).catch(
        (caught) => caught,
      );
      jest.advanceTimersByTime(31_000);
      const error = await pending;
      expect(error).toBeInstanceOf(DeepSeekError);
      expect((error as DeepSeekError).status).toBe(504);
      expect(calls).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("400 不重试直接失败", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 400 });
    }) as unknown as typeof fetch;

    const error = await chatCompletionJson([{ role: "user", content: "hi" }]).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(DeepSeekError);
    expect(calls).toBe(1);
  });

  it("未配置 API key 抛出 500", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const error = await chatCompletionJson([{ role: "user", content: "hi" }]).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(DeepSeekError);
    expect((error as DeepSeekError).status).toBe(500);
  });
});
