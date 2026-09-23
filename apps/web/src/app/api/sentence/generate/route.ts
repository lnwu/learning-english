import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { chatCompletionJson } from "@/lib/deepseek";
import { MAX_LEMMA_LENGTH } from "@/lib/lemma";
import {
  buildGenerateMessages,
  parseGenerateResult,
  MAX_SENTENCE_WORDS,
  MAX_TRANSLATION_LENGTH,
  type SentenceWord,
} from "@/lib/sentenceMessages";

const MIN_WORDS = 1;

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.sentenceGenerate,
      fallbackError: "生成失败，请稍后重试",
    },
    (raw) => {
      const body = (raw ?? {}) as {
        words?: Array<{ word?: unknown; translation?: unknown }>;
      };

      const words: SentenceWord[] = Array.isArray(body.words)
        ? body.words
            .map((item) => ({
              word: typeof item?.word === "string" ? item.word.trim() : "",
              translation:
                typeof item?.translation === "string"
                  ? item.translation.trim()
                  : "",
            }))
            .filter((item) => item.word)
            .slice(0, MAX_SENTENCE_WORDS)
        : [];

      if (words.length < MIN_WORDS) {
        return {
          ok: false,
          response: NextResponse.json({ error: "缺少单词" }, { status: 400 }),
        };
      }

      if (
        words.some(
          (item) =>
            item.word.length > MAX_LEMMA_LENGTH ||
            item.translation.length > MAX_TRANSLATION_LENGTH
        )
      ) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "输入内容过长" },
            { status: 400 }
          ),
        };
      }

      return { ok: true, body: words };
    },
    async (words) => {
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
