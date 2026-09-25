import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import {
  badRequest,
  parseBody,
  sentenceWordList,
  type SentenceWordInput,
} from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/deepseek";
import { MAX_LEMMA_LENGTH } from "@/lib/lemma";
import {
  buildGenerateMessages,
  parseGenerateResult,
  MAX_TRANSLATION_LENGTH,
} from "@/lib/sentenceMessages";
import { MAX_SENTENCE_WORDS } from "@/lib/sentenceWords";

const MIN_WORDS = 1;

const parseWords = parseBody<{ words: SentenceWordInput[] }>({
  words: sentenceWordList({
    maxItems: MAX_SENTENCE_WORDS,
    maxWordLength: MAX_LEMMA_LENGTH,
    maxTranslationLength: MAX_TRANSLATION_LENGTH,
  }),
});

const parse = (raw: unknown) => {
  const parsed = parseWords(raw);
  if (!parsed.ok) return parsed;
  if (parsed.body.words.length < MIN_WORDS) {
    return { ok: false as const, response: badRequest("缺少单词") };
  }
  return parsed;
};

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.sentenceGenerate,
      fallbackError: "生成失败，请稍后重试",
    },
    parse,
    async ({ words }) => {
      const result = parseGenerateResult(
        await chatCompletionJson<unknown>(buildGenerateMessages(words))
      );

      if (!result) {
        return NextResponse.json(
          { error: "生成失败，请稍后重试" },
          { status: 502 }
        );
      }

      return NextResponse.json({
        chinese: result.chinese,
        english: result.english,
        words: words.map((item) => item.word),
      });
    }
  );
}
