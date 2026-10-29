import { describe, it, expect } from "bun:test";
import { createPreferenceState } from "./preferenceState";

describe("createPreferenceState", () => {
  it("应用当前这次加载的结果并返回是否变化", () => {
    const state = createPreferenceState(30);
    const token = state.beginLoad("a") ?? 0;
    expect(state.applyLoad(token, 45)).toBe(true);
    expect(state.get()).toBe(45);
    expect(state.applyLoad(token, 45)).toBe(false);
  });

  it("同一用户重复加载直接跳过", () => {
    const state = createPreferenceState(30);
    expect(state.beginLoad("a")).not.toBeNull();
    expect(state.beginLoad("a")).toBeNull();
  });

  it("退出登录后到达的旧结果被丢弃", () => {
    const state = createPreferenceState(30);
    const token = state.beginLoad("a") ?? 0;
    expect(state.reset()).toBe(false);
    expect(state.applyLoad(token, 45)).toBe(false);
    expect(state.get()).toBe(30);
  });

  it("切换账号后先发起的旧结果不覆盖新账号", () => {
    const state = createPreferenceState(30);
    const staleToken = state.beginLoad("a") ?? 0;
    const freshToken = state.beginLoad("b") ?? 0;
    expect(state.applyLoad(staleToken, 45)).toBe(false);
    expect(state.applyLoad(freshToken, 60)).toBe(true);
    expect(state.get()).toBe(60);
  });

  it("保存之后到达的旧结果不覆盖刚保存的值", () => {
    const state = createPreferenceState(30);
    const token = state.beginLoad("a") ?? 0;
    expect(state.applySave("a", 45)).toBe(true);
    expect(state.applyLoad(token, 30)).toBe(false);
    expect(state.get()).toBe(45);
  });

  it("加载失败后允许重试", () => {
    const state = createPreferenceState(30);
    const token = state.beginLoad("a") ?? 0;
    state.failLoad(token);
    expect(state.beginLoad("a")).not.toBeNull();
  });

  it("过期的加载失败不影响更新的加载", () => {
    const state = createPreferenceState(30);
    const staleToken = state.beginLoad("a") ?? 0;
    expect(state.beginLoad("b")).not.toBeNull();
    state.failLoad(staleToken);
    expect(state.beginLoad("b")).toBeNull();
  });

  it("reset 只在值变化时返回 true", () => {
    const state = createPreferenceState(30);
    const token = state.beginLoad("a") ?? 0;
    state.applyLoad(token, 45);
    expect(state.reset()).toBe(true);
    expect(state.get()).toBe(30);
    expect(state.reset()).toBe(false);
  });

  it("reset 之后同一用户可以重新加载", () => {
    const state = createPreferenceState(30);
    state.beginLoad("a");
    state.reset();
    expect(state.beginLoad("a")).not.toBeNull();
  });
});
