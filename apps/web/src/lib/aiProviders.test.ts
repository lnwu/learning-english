import { describe, it, expect } from "bun:test";
import {
  DEFAULT_AI_MODEL_ID,
  isAiModelEnabled,
  isAiModelId,
  listEnabledAiModels,
  resolveAiModel,
} from "./aiProviders";
import { useEnvVar } from "./testSupport";

describe("aiProviders", () => {
  useEnvVar("DEEPSEEK_API_KEY", "test-key");
  useEnvVar("MIMO_API_KEY", "test-key");
  useEnvVar("OPENCODE_API_KEY", "");

  it("缺省解析为默认模型", () => {
    expect(resolveAiModel()?.id).toBe(DEFAULT_AI_MODEL_ID);
    expect(resolveAiModel("")?.id).toBe(DEFAULT_AI_MODEL_ID);
  });

  it("按复合 ID 解析模型", () => {
    expect(resolveAiModel("mimo/mimo-v2.6-pro")?.provider).toBe("mimo");
    expect(resolveAiModel("opencode/claude-sonnet-5-5")?.sdk).toBe("anthropic");
    expect(resolveAiModel("opencode/gemini-3.8-flash")?.sdk).toBe("google");
  });

  it("未知模型解析为 undefined", () => {
    expect(resolveAiModel("unknown/model")).toBeUndefined();
    expect(isAiModelId("unknown/model")).toBe(false);
    expect(isAiModelId(DEFAULT_AI_MODEL_ID)).toBe(true);
  });

  it("按 API key 是否配置判断启用", () => {
    const mimo = resolveAiModel("mimo/mimo-v2.6-flash");
    const zen = resolveAiModel("opencode/gemini-3.8-flash");
    expect(mimo && isAiModelEnabled(mimo)).toBe(true);
    expect(zen && isAiModelEnabled(zen)).toBe(false);

    const enabled = listEnabledAiModels();
    expect(enabled.some((model) => model.provider === "deepseek")).toBe(true);
    expect(enabled.some((model) => model.provider === "mimo")).toBe(true);
    expect(enabled.some((model) => model.provider === "opencode")).toBe(false);
  });
});
