import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { chatCompletionJson } from "@/lib/deepseek";
import { MAX_LEMMA_LENGTH } from "@/lib/lemma";
import { normalizeForComparison, resolveUsedWords } from "@/lib/sentenceCompare";
import {
  buildCheckMessages,
  parseCheckResult,
  MAX_SENTENCE_LENGTH,
  MAX_SENTENCE_WORDS,
} from "@/lib/sentenceMessages";

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.sentenceCheck,
      fallbackError: "批改失败，请稍后重试",
    },
    (raw) => {
      const body = (raw ?? {}) as {
        chinese?: unknown;
        words?: unknown;
        userAnswer?: unknown;
        reference?: unknown;
      };

      const chinese =
        typeof body.chinese === "string" ? body.chinese.trim() : "";
      const userAnswer =
        typeof body.userAnswer === "string" ? body.userAnswer.trim() : "";
      const reference =
        typeof body.reference === "string" ? body.reference.trim() : "";
      const words = Array.isArray(body.words)
        ? body.words
            .filter((word): word is string => typeof word === "string")
            .map((word) => word.trim())
            .filter(Boolean)
            .slice(0, MAX_SENTENCE_WORDS)
        : [];

      if (!chinese || !userAnswer) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "缺少题目或答案" },
            { status: 400 }
          ),
        };
      }

      if (
        chinese.length > MAX_SENTENCE_LENGTH ||
        userAnswer.length > MAX_SENTENCE_LENGTH ||
        reference.length > MAX_SENTENCE_LENGTH ||
        words.some((word) => word.length > MAX_LEMMA_LENGTH)
      ) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "输入内容过长" },
            { status: 400 }
          ),
        };
      }

      return { ok: true, body: { chinese, words, reference, userAnswer } };
    },
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
