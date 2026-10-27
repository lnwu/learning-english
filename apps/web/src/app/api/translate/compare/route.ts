import { NextResponse } from "next/server";
import { apiErrorText } from "@/lib/apiErrors";
import { API_RATE_LIMITS, handleApiPost } from "@/lib/apiRoute";
import { aiModelIdList, parseBody, wordToken } from "@/lib/apiInput";
import { AI_MODEL_COUNT, isAiModelEnabled, resolveAiModel } from "@/lib/aiProviders";
import { AiServiceError } from "@/lib/aiClient";
import { lookupWord } from "@/lib/wordLookup";
import { collectWordSourceCandidates } from "@/lib/wordSourceSearch";
import type { TranslateCompareResult } from "@/lib/translateCompare";

const parse = parseBody<{ word: string; models: string[] }>({
  word: wordToken(),
  models: aiModelIdList({ maxItems: AI_MODEL_COUNT }),
});

export async function POST(request: Request) {
  return handleApiPost(
    request,
    { ...API_RATE_LIMITS.translateCompare, fallbackCode: "compareFailed" },
    parse,
    async ({ word, models }) => {
      const candidates = collectWordSourceCandidates(word);
      const results: TranslateCompareResult[] = await Promise.all(
        models.map(async (model): Promise<TranslateCompareResult> => {
          const spec = resolveAiModel(model);
          if (!spec || !isAiModelEnabled(spec)) {
            return { model, code: "modelDisabled", error: apiErrorText("modelDisabled") };
          }
          try {
            const entry = await lookupWord(word, model, candidates);
            return {
              model,
              lemma: entry.lemma,
              senses: entry.senses,
              sources: entry.sources,
            };
          } catch (error) {
            const code = error instanceof AiServiceError ? error.code : "sentenceGenerateFailed";
            return { model, code, error: apiErrorText(code) };
          }
        }),
      );
      return NextResponse.json({ results });
    },
  );
}
