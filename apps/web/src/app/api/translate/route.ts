import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { isValidWordToken } from "@/lib/lemma";
import {
  getCachedTranslation,
  setCachedTranslation,
} from "@/lib/translationCache";
import { lookupWord } from "@/lib/wordLookup";

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.translate, fallbackError: "翻译失败，请稍后重试" },
    (raw) => {
      const body = (raw ?? {}) as { word?: unknown };
      const word =
        typeof body.word === "string" ? body.word.trim().toLowerCase() : "";

      if (!isValidWordToken(word)) {
        return {
          ok: false,
          response: NextResponse.json({ error: "无效单词" }, { status: 400 }),
        };
      }

      return { ok: true, body: word };
    },
    async (word) => {
      const cached = await getCachedTranslation(word);
      if (cached) {
        return NextResponse.json(cached);
      }

      const result = await lookupWord(word);
      setCachedTranslation(word, result);
      return NextResponse.json(result);
    }
  );
}
