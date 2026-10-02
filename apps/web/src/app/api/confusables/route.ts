import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { optionalAiModelId, parseBody, wordSensesList, type WordSensesInput } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/aiClient";
import {
  buildConfusableSensesMessages,
  parseConfusableSenses,
  MAX_CONFUSABLES_PER_WORD,
} from "@/lib/confusables";

const TIMEOUT_MS = 60_000;

const parse = parseBody<{ words: WordSensesInput[]; model: string }>({
  words: wordSensesList({ maxItems: MAX_CONFUSABLES_PER_WORD }),
  model: optionalAiModelId(),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.confusables, fallbackError: "区分易混词失败，请稍后重试" },
    parse,
    async ({ words, model }) => {
      const raw = await chatCompletionJson<unknown>(buildConfusableSensesMessages(words), {
        temperature: 0.2,
        maxOutputTokens: 8192,
        timeoutMs: TIMEOUT_MS,
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
