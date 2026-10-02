import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { parseBody, wordTokenList, optionalAiModelId } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/aiClient";
import {
  buildNormalizeMessages,
  parseNormalizeResults,
  MAX_NORMALIZE_BATCH_SIZE,
} from "@/lib/normalizeWords";

const parse = parseBody<{ words: string[]; model: string }>({
  words: wordTokenList({ maxItems: MAX_NORMALIZE_BATCH_SIZE }),
  model: optionalAiModelId(),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.normalizeWords,
      fallbackError: "归一化单词失败，请稍后重试",
    },
    parse,
    async ({ words, model }) => {
      const raw = await chatCompletionJson<unknown>(buildNormalizeMessages(words), {
        temperature: 0.2,
        maxOutputTokens: 8192,
        model,
      });
      return NextResponse.json({ results: parseNormalizeResults(raw, words) });
    },
  );
}
