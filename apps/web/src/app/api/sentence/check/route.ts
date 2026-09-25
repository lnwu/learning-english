import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { optionalText, parseBody, requiredText, wordList } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/deepseek";
import { MAX_LEMMA_LENGTH } from "@/lib/lemma";
import { normalizeForComparison, resolveUsedWords } from "@/lib/sentenceCompare";
import {
  buildCheckMessages,
  parseCheckResult,
  MAX_SENTENCE_LENGTH,
} from "@/lib/sentenceMessages";
import { MAX_SENTENCE_WORDS } from "@/lib/sentenceWords";

const parse = parseBody<{
  chinese: string;
  words: string[];
  reference: string;
  userAnswer: string;
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
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.sentenceCheck,
      fallbackError: "批改失败，请稍后重试",
    },
    parse,
    async ({ chinese, words, reference, userAnswer }) => {
      const normalizedAnswer = normalizeForComparison(userAnswer);
      const exactMatch =
        reference.length > 0 &&
        normalizedAnswer.length > 0 &&
        normalizedAnswer === normalizeForComparison(reference);

      if (exactMatch) {
        return NextResponse.json({
          correct: true,
          score: 100,
          feedback: "答案正确，评分已按大小写不敏感处理。",
          corrected: reference,
          issues: [],
          usedWords: resolveUsedWords(reference, words),
        });
      }

      const result = await chatCompletionJson<unknown>(
        buildCheckMessages({ chinese, words, reference, userAnswer })
      );
      return NextResponse.json(parseCheckResult(result, words));
    }
  );
}
