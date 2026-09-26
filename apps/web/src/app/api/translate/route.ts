import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { parseBody, wordToken } from "@/lib/apiInput";
import { getCachedTranslation, setCachedTranslation } from "@/lib/translationCache";
import { lookupWord } from "@/lib/wordLookup";

const parse = parseBody<{ word: string }>({ word: wordToken() });

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.translate, fallbackError: "翻译失败，请稍后重试" },
    parse,
    async ({ word }) => {
      const cached = await getCachedTranslation(word);
      if (cached) {
        return NextResponse.json(cached);
      }

      const result = await lookupWord(word);
      setCachedTranslation(word, result);
      return NextResponse.json(result);
    },
  );
}
