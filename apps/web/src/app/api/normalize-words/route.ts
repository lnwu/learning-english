import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { parseBody, wordTokenList } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/deepseek";
import {
  buildNormalizeMessages,
  parseNormalizeResults,
  MAX_NORMALIZE_BATCH_SIZE,
} from "@/lib/normalizeWords";

const parse = parseBody<{ words: string[] }>({
  words: wordTokenList({ maxItems: MAX_NORMALIZE_BATCH_SIZE }),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.normalizeWords,
      fallbackError: "归一化单词失败，请稍后重试",
    },
    parse,
    async ({ words }) => {
      const raw = await chatCompletionJson<unknown>(
        buildNormalizeMessages(words),
        { temperature: 0.2 }
      );
      return NextResponse.json({ results: parseNormalizeResults(raw, words) });
    }
  );
}
