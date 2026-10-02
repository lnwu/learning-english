export type AiSdkKind = "openai-compatible" | "anthropic" | "google";

export interface AiModelSpec {
  id: string;
  provider: string;
  providerName: string;
  model: string;
  label: string;
  sdk: AiSdkKind;
  baseUrl: string;
  apiKeyEnv: string;
  supportsTemperature: boolean;
}

export interface AiModelOption {
  id: string;
  label: string;
  provider: string;
  providerName: string;
}

interface AiModelDefinition {
  model: string;
  label: string;
  supportsTemperature?: boolean;
}

const define = (
  provider: string,
  providerName: string,
  apiKeyEnv: string,
  baseUrl: string,
  sdk: AiSdkKind,
  models: AiModelDefinition[],
): AiModelSpec[] =>
  models.map(({ model, label, supportsTemperature = true }) => ({
    id: `${provider}/${model}`,
    provider,
    providerName,
    model,
    label,
    sdk,
    baseUrl,
    apiKeyEnv,
    supportsTemperature,
  }));

const AI_MODELS: AiModelSpec[] = [
  ...define(
    "deepseek",
    "DeepSeek",
    "DEEPSEEK_API_KEY",
    "https://api.deepseek.com",
    "openai-compatible",
    [{ model: "deepseek-flash", label: "DeepSeek V4.1 Flash" }],
  ),
  ...define(
    "opencode",
    "OpenCode Zen",
    "OPENCODE_API_KEY",
    "https://opencode.ai/zen/v1",
    "google",
    [{ model: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }],
  ),
  ...define(
    "opencode",
    "OpenCode Zen",
    "OPENCODE_API_KEY",
    "https://opencode.ai/zen/v1",
    "anthropic",
    [
      { model: "claude-opus-5-5", label: "Claude Opus 5.5", supportsTemperature: false },
      { model: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", supportsTemperature: false },
    ],
  ),
  ...define("mimo", "MiMo", "MIMO_API_KEY", "https://api.xiaomimimo.com/v1", "openai-compatible", [
    { model: "mimo-v2.6-flash", label: "MiMo V2.6 Flash" },
    { model: "mimo-v2.6-pro", label: "MiMo V2.6 Pro" },
  ]),
];

export const DEFAULT_AI_MODEL_ID = "deepseek/deepseek-flash";

const byId = new Map(AI_MODELS.map((spec) => [spec.id, spec]));

export const isAiModelId = (value: string): boolean => byId.has(value);

export const resolveAiModel = (id?: string): AiModelSpec | undefined =>
  byId.get(id || DEFAULT_AI_MODEL_ID);

export const isAiModelEnabled = (spec: AiModelSpec): boolean =>
  Boolean(process.env[spec.apiKeyEnv]);

export const listEnabledAiModels = (): AiModelOption[] =>
  AI_MODELS.filter(isAiModelEnabled).map(({ id, label, provider, providerName }) => ({
    id,
    label,
    provider,
    providerName,
  }));
