import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import {
  optionalText,
  optionalAiModelId,
  parseBody,
  wordSensesList,
  type WordSensesInput,
} from "@/lib/apiInput";
import { chatCompletionJson, type AiProviderOptions } from "@/lib/aiClient";
import {
  buildConfusableGroupsMessages,
  parseConfusableGroups,
  MAX_CONFUSABLES_WORDS,
} from "@/lib/confusables";

const TIMEOUT_MS = 120_000;

const PROBES: Record<string, AiProviderOptions[string]> = {
  baseline: {},
  "thinking-off": { thinking: { type: "disabled" } },
  "thinking-on": { thinking: { type: "enabled" } },
  "enable-thinking-false": { enable_thinking: false },
  "effort-none": { reasoning_effort: "none" },
  "effort-minimal": { reasoning_effort: "minimal" },
  "reasoning-disabled": { reasoning: { enabled: false } },
};

const parse = parseBody<{ words: WordSensesInput[]; model: string; probe: string }>({
  words: wordSensesList({ maxItems: MAX_CONFUSABLES_WORDS }),
  model: optionalAiModelId(),
  probe: optionalText(24),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.confusableGroups, fallbackError: "区分易混词失败，请稍后重试" },
    parse,
    async ({ words, model, probe }) => {
      const raw = await chatCompletionJson<unknown>(buildConfusableGroupsMessages(words), {
        temperature: 0.2,
        maxOutputTokens: 16384,
        timeoutMs: TIMEOUT_MS,
        model,
        providerOptions: probe ? { deepseek: PROBES[probe] ?? {} } : undefined,
      });
      return NextResponse.json({
        groups: parseConfusableGroups(
          raw,
          words.map((item) => item.word),
        ),
      });
    },
  );
}
