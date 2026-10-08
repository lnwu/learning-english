import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { optionalAiModelId, optionalBoolean, parseBody, wordToken } from "@/lib/apiInput";
import { getCachedTranslation, setCachedTranslation } from "@/lib/translationCache";
import { DEFAULT_AI_MODEL_ID } from "@/lib/aiProviders";
import { lookupWordWithSources } from "@/lib/wordLookup";

const parse = parseBody<{ word: string; model: string; refresh: boolean }>({
  word: wordToken(),
  model: optionalAiModelId(),
  refresh: optionalBoolean(),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    ({ refresh }) => ({
      ...(refresh ? API_RATE_LIMITS.translateRefresh : API_RATE_LIMITS.translate),
      fallbackError: "翻译失败，请稍后重试",
    }),
    parse,
    async ({ word, model, refresh }) => {
      const modelId = model || DEFAULT_AI_MODEL_ID;
      if (!refresh) {
        const cached = await getCachedTranslation(word, modelId);
        if (cached) {
          return NextResponse.json(cached);
        }
      }

      const result = await lookupWordWithSources(word, modelId);
      setCachedTranslation(word, result, modelId);
      return NextResponse.json(result);
    },
  );
}
