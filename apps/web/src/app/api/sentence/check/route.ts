import { NextResponse } from "next/server";
import { API_RATE_LIMITS, handleApiPost } from "@/lib/apiRoute";
import { optionalText, optionalAiModelId, parseBody, requiredText, wordList } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/aiClient";
import { MAX_LEMMA_LENGTH } from "@/lib/lemma";
import {
  buildCheckMessages,
  buildExactMatchResult,
  isExactMatchAnswer,
  parseCheckResult,
  MAX_SENTENCE_LENGTH,
} from "@/lib/sentenceMessages";
import { MAX_SENTENCE_WORDS } from "@/lib/sentenceWords";

const parse = parseBody<{
  chinese: string;
  words: string[];
  reference: string;
  userAnswer: string;
  model: string;
}>({
  chinese: requiredText({
    maxLength: MAX_SENTENCE_LENGTH,
    message: "缺少题目或答案",
  }),
  userAnswer: requiredText({
    maxLength: MAX_SENTENCE_LENGTH,
    message: "缺少题目或答案",
  }),
  words: wordList({
    maxItems: MAX_SENTENCE_WORDS,
    maxItemLength: MAX_LEMMA_LENGTH,
  }),
  reference: optionalText(MAX_SENTENCE_LENGTH),
  model: optionalAiModelId(),
});

export async function POST(request: Request) {
  return handleApiPost(
    request,
    {
      ...API_RATE_LIMITS.sentenceCheck,
      fallbackError: "批改失败，请稍后重试",
    },
    parse,
    async ({ chinese, words, reference, userAnswer, model }) => {
      if (isExactMatchAnswer(reference, userAnswer)) {
        return NextResponse.json(buildExactMatchResult(reference));
      }

      const result = await chatCompletionJson<unknown>(
        buildCheckMessages({ chinese, words, reference, userAnswer }),
        { model },
      );
      return NextResponse.json(parseCheckResult(result));
    },
  );
}
