import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { optionalAiModelId, parseBody, wordToken } from "@/lib/apiInput";
import { getCachedTranslation, setCachedTranslation } from "@/lib/translationCache";
import { DEFAULT_AI_MODEL_ID } from "@/lib/aiProviders";
import { lookupWord } from "@/lib/wordLookup";

const parse = parseBody<{ word: string; model: string }>({
  word: wordToken(),
  model: optionalAiModelId(),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.translate, fallbackError: "翻译失败，请稍后重试" },
    parse,
    async ({ word, model }) => {
      const modelId = model || DEFAULT_AI_MODEL_ID;
      const cached = await getCachedTranslation(word, modelId);
      if (cached) {
        return NextResponse.json(cached);
      }

      const result = await lookupWord(word, modelId);
      setCachedTranslation(word, result, modelId);
      return NextResponse.json(result);
    },
  );
}
