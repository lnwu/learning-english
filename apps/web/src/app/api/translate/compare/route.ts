import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { aiModelIdList, parseBody, wordToken } from "@/lib/apiInput";
import { isAiModelEnabled, resolveAiModel } from "@/lib/aiProviders";
import { AiServiceError } from "@/lib/aiClient";
import { lookupWord } from "@/lib/wordLookup";
import { MAX_COMPARE_MODELS, type TranslateCompareResult } from "@/lib/translateCompare";

const parse = parseBody<{ word: string; models: string[] }>({
  word: wordToken(),
  models: aiModelIdList({ maxItems: MAX_COMPARE_MODELS }),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.translateCompare, fallbackError: "对比生成失败，请稍后重试" },
    parse,
    async ({ word, models }) => {
      const results: TranslateCompareResult[] = await Promise.all(
        models.map(async (model) => {
          const spec = resolveAiModel(model);
          if (!spec || !isAiModelEnabled(spec)) {
            return { model, error: "模型未启用" };
          }
          try {
            const entry = await lookupWord(word, model);
            return { model, lemma: entry.lemma, senses: entry.senses };
          } catch (error) {
            return {
              model,
              error: error instanceof AiServiceError ? error.message : "生成失败，请稍后重试",
            };
          }
        }),
      );
      return NextResponse.json({ results });
    },
  );
}
