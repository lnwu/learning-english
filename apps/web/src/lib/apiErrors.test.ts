import { describe, it, expect } from "bun:test";
import {
  API_ERROR_KEYS,
  apiErrorBody,
  apiErrorText,
  isApiErrorCode,
  readApiErrorCode,
  type ApiErrorCode,
} from "./apiErrors";

const codes = Object.keys(API_ERROR_KEYS) as ApiErrorCode[];

describe("isApiErrorCode", () => {
  it("接受所有已声明的错误码", () => {
    for (const code of codes) expect(isApiErrorCode(code)).toBe(true);
  });

  it("拒绝未知值与非字符串", () => {
    expect(isApiErrorCode("unknownCode")).toBe(false);
    expect(isApiErrorCode("")).toBe(false);
    expect(isApiErrorCode(undefined)).toBe(false);
    expect(isApiErrorCode(null)).toBe(false);
    expect(isApiErrorCode(400)).toBe(false);
    expect(isApiErrorCode({ code: "rateLimited" })).toBe(false);
  });

  it("拒绝原型链上的键名", () => {
    expect(isApiErrorCode("toString")).toBe(false);
    expect(isApiErrorCode("constructor")).toBe(false);
  });
});

describe("apiErrorText", () => {
  it("默认返回中文文案", () => {
    expect(apiErrorText("rateLimited")).toBe("请求过于频繁，请稍后再试");
  });

  it("按 locale 返回对应文案", () => {
    expect(apiErrorText("rateLimited", "en")).toBe("Too many requests, please try again later");
    expect(apiErrorText("invalidWord", "en")).toBe("Invalid word");
  });

  it("每个错误码都有中英两种非空文案", () => {
    for (const code of codes) {
      expect(apiErrorText(code, "zh").length).toBeGreaterThan(0);
      expect(apiErrorText(code, "en").length).toBeGreaterThan(0);
    }
  });
});

describe("apiErrorBody", () => {
  it("同时下发错误码与中文兜底文案", () => {
    expect(apiErrorBody("unknownModel")).toEqual({ code: "unknownModel", error: "未知模型" });
  });

  it("附加字段合并进错误体", () => {
    expect(apiErrorBody("invalidJson", { requestId: "r-1" })).toEqual({
      code: "invalidJson",
      error: "请求格式错误",
      requestId: "r-1",
    });
  });
});

describe("readApiErrorCode", () => {
  it("从响应体读取已声明的错误码", () => {
    expect(readApiErrorCode({ code: "rateLimited", error: "x" })).toBe("rateLimited");
  });

  it("未知码、缺失码与非对象都返回 null", () => {
    expect(readApiErrorCode({ code: "legacy", error: "x" })).toBeNull();
    expect(readApiErrorCode({ error: "请求失败" })).toBeNull();
    expect(readApiErrorCode(null)).toBeNull();
    expect(readApiErrorCode("rateLimited")).toBeNull();
    expect(readApiErrorCode(undefined)).toBeNull();
  });
});
