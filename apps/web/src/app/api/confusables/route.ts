import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import {
  optionalText,
  optionalAiModelId,
  parseBody,
  wordSensesList,
  type WordSensesInput,
} from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/aiClient";
import {
  buildConfusableSensesMessages,
  parseConfusableSenses,
  MAX_CONFUSABLES_PER_WORD,
} from "@/lib/confusables";

const TIMEOUT_MS = 60_000;

const parse = parseBody<{ words: WordSensesInput[]; model: string; probe: string }>({
  words: wordSensesList({ maxItems: MAX_CONFUSABLES_PER_WORD }),
  model: optionalAiModelId(),
  probe: optionalText(24),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.confusables, fallbackError: "区分易混词失败，请稍后重试" },
    parse,
    async ({ words, model, probe }) => {
      const raw = await chatCompletionJson<unknown>(buildConfusableSensesMessages(words), {
        temperature: 0.2,
        maxOutputTokens: 8192,
        timeoutMs: TIMEOUT_MS,
        disableThinking: probe === "thinking-off",
        model,
      });
      return NextResponse.json({
        results: parseConfusableSenses(
          raw,
          words.map((item) => item.word),
        ),
      });
    },
  );
}
