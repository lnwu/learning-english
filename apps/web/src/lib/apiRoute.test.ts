import { describe, it, expect } from "bun:test";
import { NextResponse } from "next/server";
import { AiServiceError } from "./aiClient";
import { badRequest } from "./apiInput";
import { mapApiError, handleApiPost } from "./apiRoute";
import {
  makeToken,
  mockIdentityToolkitFetch,
  useConsoleSpy,
  useEnvVar,
  useNoRedisEnv,
  useRestoredFetch,
} from "./testSupport";

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
  it("AiServiceError 透传状态码与错误码", () => {
    expect(
      mapApiError(new AiServiceError("超时", 504, { code: "aiTimeout" }), "translateFailed"),
    ).toEqual({
      status: 504,
      code: "aiTimeout",
    });
  });

  it("未声明错误码的 AiServiceError 回退到调用失败", () => {
    expect(mapApiError(new AiServiceError("boom", 502), "translateFailed")).toEqual({
      status: 502,
      code: "aiCallFailed",
    });
  });

  it("其他错误返回 500 与兜底错误码", () => {
    expect(mapApiError(new Error("boom"), "translateFailed")).toEqual({
      status: 500,
      code: "translateFailed",
    });
  });
});

describe("handleApiPost", () => {
  useNoRedisEnv();
  useEnvVar("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
  useRestoredFetch();
  useConsoleSpy("error");
  useConsoleSpy("warn");
  useConsoleSpy("log");

  it("缺少 token 时返回 401 且不调用 parse/handle", async () => {
    let called = false;
    const response = await handleApiPost(
      makeRequest("{}"),
      { name: "guard-401", limit: 10, fallbackCode: "requestFailed" },
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
    expect(await response.json()).toMatchObject({ code: "notAuthenticated" });
    expect(called).toBe(false);
  });

  it("token 校验失败时返回 401", async () => {
    mockIdentityToolkitFetch({ ok: false });
    const response = await handleApiPost(
      makeRequest("{}", makeToken("uid-401")),
      { name: "guard-401b", limit: 10, fallbackCode: "requestFailed" },
      okParse,
      okHandle,
    );

    expect(response.status).toBe(401);
  });

  it("请求体不是合法 JSON 时返回 400", async () => {
    mockIdentityToolkitFetch();
    const response = await handleApiPost(
      makeRequest("not-json", makeToken("uid-bad-json")),
      { name: "guard-400", limit: 10, fallbackCode: "requestFailed" },
      okParse,
      okHandle,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalidJson", error: "请求格式错误" });
    expect(response.headers.get("x-request-id")).toBeString();
  });

  it("parse 拒绝时直接返回其响应", async () => {
    mockIdentityToolkitFetch();
    const response = await handleApiPost(
      makeRequest("{}", makeToken("uid-parse")),
      { name: "parse-reject", limit: 10, fallbackCode: "requestFailed" },
      () => ({ ok: false, response: badRequest("invalidWord") }),
      okHandle,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalidWord", error: "无效单词" });
  });

  it("handle 成功时返回其响应", async () => {
    mockIdentityToolkitFetch();
    const response = await handleApiPost(
      makeRequest("{}", makeToken("uid-ok")),
      { name: "handle-ok", limit: 10, fallbackCode: "requestFailed" },
      okParse,
      okHandle,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("handle 抛出 AiServiceError 时映射状态码与错误码", async () => {
    mockIdentityToolkitFetch();
    const response = await handleApiPost(
      makeRequest("{}", makeToken("uid-ai-service")),
      { name: "handle-ai-service", limit: 10, fallbackCode: "requestFailed" },
      okParse,
      async () => {
        throw new AiServiceError("上游 400", 502, { code: "aiError" });
      },
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as { code: string; error: string; requestId: string };
    expect(body).toMatchObject({ code: "aiError", error: "AI 服务返回错误，请稍后重试" });
    const requestId = response.headers.get("x-request-id") ?? "";
    expect(requestId).toBeString();
    expect(body.requestId).toBe(requestId);
  });

  it("handle 抛出其他错误时返回 500 与兜底错误码", async () => {
    mockIdentityToolkitFetch();
    const response = await handleApiPost(
      makeRequest("{}", makeToken("uid-unknown")),
      { name: "handle-unknown", limit: 10, fallbackCode: "translateFailed" },
      okParse,
      async () => {
        throw new Error("boom");
      },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "translateFailed",
      error: "翻译失败，请稍后重试",
    });
  });

  it("超过限额时返回 429", async () => {
    mockIdentityToolkitFetch({ localId: "uid-limit" });
    const token = makeToken("uid-limit");
    const policy = { name: "limit-1", limit: 1, fallbackCode: "requestFailed" } as const;

    const first = await handleApiPost(makeRequest("{}", token), policy, okParse, okHandle);
    const second = await handleApiPost(makeRequest("{}", token), policy, okParse, okHandle);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: "rateLimited" });
  });
});
