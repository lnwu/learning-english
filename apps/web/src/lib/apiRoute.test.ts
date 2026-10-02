import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { NextResponse } from "next/server";
import { DeepSeekError } from "./deepseek";
import { mapApiError, withApiPost } from "./apiRoute";
import { makeToken, useEnvVar, useNoRedisEnv, useRestoredFetch } from "./testSupport";

const makeRequest = (body: string, token?: string) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  });

const okParse = (raw: unknown) => ({
  ok: true as const,
  body: raw as { value: string },
});

const okHandle = async () => NextResponse.json({ ok: true });

describe("mapApiError", () => {
  it("DeepSeekError 透传状态码与消息", () => {
    expect(mapApiError(new DeepSeekError("超时", 504), "兜底")).toEqual({
      status: 504,
      error: "超时",
    });
  });

  it("其他错误返回 500 与兜底文案", () => {
    expect(mapApiError(new Error("boom"), "兜底")).toEqual({
      status: 500,
      error: "兜底",
    });
  });
});

describe("withApiPost", () => {
  useNoRedisEnv();
  useEnvVar("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
  useRestoredFetch();
  let errorSpy: ReturnType<typeof spyOn>;

  const mockFetch = (ok: boolean, localId = "uid-1") => {
    globalThis.fetch = (async () =>
      ({
        ok,
        json: async () => ({ users: ok ? [{ localId }] : [] }),
      }) as unknown as Response) as unknown as typeof fetch;
  };

  beforeEach(() => {
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("缺少 token 时返回 401 且不调用 parse/handle", async () => {
    let called = false;
    const response = await withApiPost(
      makeRequest("{}"),
      { name: "guard-401", limit: 10, fallbackError: "兜底" },
      () => {
        called = true;
        return okParse({});
      },
      async () => {
        called = true;
        return okHandle();
      },
    );

    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it("token 校验失败时返回 401", async () => {
    mockFetch(false);
    const response = await withApiPost(
      makeRequest("{}", makeToken("uid-401")),
      { name: "guard-401b", limit: 10, fallbackError: "兜底" },
      okParse,
      okHandle,
    );

    expect(response.status).toBe(401);
  });

  it("请求体不是合法 JSON 时返回 400", async () => {
    mockFetch(true);
    const response = await withApiPost(
      makeRequest("not-json", makeToken("uid-bad-json")),
      { name: "guard-400", limit: 10, fallbackError: "兜底" },
      okParse,
      okHandle,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求格式错误" });
  });

  it("parse 拒绝时直接返回其响应", async () => {
    mockFetch(true);
    const response = await withApiPost(
      makeRequest("{}", makeToken("uid-parse")),
      { name: "parse-reject", limit: 10, fallbackError: "兜底" },
      () => ({
        ok: false,
        response: NextResponse.json({ error: "无效单词" }, { status: 400 }),
      }),
      okHandle,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "无效单词" });
  });

  it("handle 成功时返回其响应", async () => {
    mockFetch(true);
    const response = await withApiPost(
      makeRequest("{}", makeToken("uid-ok")),
      { name: "handle-ok", limit: 10, fallbackError: "兜底" },
      okParse,
      okHandle,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("handle 抛出 DeepSeekError 时映射状态码与消息", async () => {
    mockFetch(true);
    const response = await withApiPost(
      makeRequest("{}", makeToken("uid-deepseek")),
      { name: "handle-deepseek", limit: 10, fallbackError: "兜底" },
      okParse,
      async () => {
        throw new DeepSeekError("AI 服务返回错误，请稍后重试", 502);
      },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "AI 服务返回错误，请稍后重试",
    });
  });

  it("handle 抛出其他错误时返回 500 与兜底文案", async () => {
    mockFetch(true);
    const response = await withApiPost(
      makeRequest("{}", makeToken("uid-unknown")),
      { name: "handle-unknown", limit: 10, fallbackError: "自定义兜底" },
      okParse,
      async () => {
        throw new Error("boom");
      },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "自定义兜底" });
  });

  it("超过限额时返回 429", async () => {
    mockFetch(true, "uid-limit");
    const token = makeToken("uid-limit");
    const policy = { name: "limit-1", limit: 1, fallbackError: "兜底" };

    const first = await withApiPost(makeRequest("{}", token), policy, okParse, okHandle);
    const second = await withApiPost(makeRequest("{}", token), policy, okParse, okHandle);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
