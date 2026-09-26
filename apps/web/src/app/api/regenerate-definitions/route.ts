import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { parseBody, wordTokenList } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/deepseek";
import {
  buildRegenerateMessages,
  parseRegenerateResults,
  MAX_REGENERATE_BATCH_SIZE,
} from "@/lib/regenerateDefinitions";

const parse = parseBody<{ words: string[] }>({
  words: wordTokenList({ maxItems: MAX_REGENERATE_BATCH_SIZE }),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.regenerateDefinitions,
      fallbackError: "重新生成释义失败，请稍后重试",
    },
    parse,
    async ({ words }) => {
      const raw = await chatCompletionJson<unknown>(buildRegenerateMessages(words), {
        temperature: 0.2,
      });
      return NextResponse.json({
        results: parseRegenerateResults(raw, words),
      });
    },
  );
}
