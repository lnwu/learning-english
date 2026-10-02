import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { optionalAiModelId, parseBody, wordSensesList, type WordSensesInput } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/aiClient";
import {
  buildConfusableGroupsMessages,
  parseConfusableGroups,
  MAX_CONFUSABLES_WORDS,
} from "@/lib/confusables";

const TIMEOUT_MS = 120_000;

const parse = parseBody<{ words: WordSensesInput[]; model: string }>({
  words: wordSensesList({ maxItems: MAX_CONFUSABLES_WORDS }),
  model: optionalAiModelId(),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.confusableGroups, fallbackError: "区分易混词失败，请稍后重试" },
    parse,
    async ({ words, model }) => {
      const raw = await chatCompletionJson<unknown>(buildConfusableGroupsMessages(words), {
        temperature: 0.2,
        maxOutputTokens: 16384,
        timeoutMs: TIMEOUT_MS,
        disableThinking: true,
        model,
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
