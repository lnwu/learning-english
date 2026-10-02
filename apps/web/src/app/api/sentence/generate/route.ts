import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import {
  badRequest,
  optionalAiModelId,
  parseBody,
  sentenceWordList,
  type SentenceWordInput,
} from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/aiClient";
import { MAX_LEMMA_LENGTH } from "@/lib/lemma";
import {
  buildGenerateMessages,
  parseGenerateResult,
  MAX_TRANSLATION_LENGTH,
} from "@/lib/sentenceMessages";
import { MIN_SENTENCE_WORDS, SENTENCE_WORD_POOL_SIZE } from "@/lib/sentenceWords";

const parseWords = parseBody<{ words: SentenceWordInput[]; model: string }>({
  words: sentenceWordList({
    maxItems: SENTENCE_WORD_POOL_SIZE,
    maxWordLength: MAX_LEMMA_LENGTH,
    maxTranslationLength: MAX_TRANSLATION_LENGTH,
  }),
  model: optionalAiModelId(),
});

const parse = (raw: unknown) => {
  const parsed = parseWords(raw);
  if (!parsed.ok) return parsed;
  if (parsed.body.words.length < MIN_SENTENCE_WORDS) {
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
    async ({ words, model }) => {
      const result = parseGenerateResult(
        await chatCompletionJson<unknown>(buildGenerateMessages(words), { model }),
        words.map((item) => item.word),
      );

      if (!result) {
        return NextResponse.json({ error: "生成失败，请稍后重试" }, { status: 502 });
      }

      return NextResponse.json({
        chinese: result.chinese,
        english: result.english,
        words: result.words,
      });
    },
  );
}
