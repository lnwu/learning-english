import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { chatCompletionJson } from "@/lib/deepseek";
import { isValidWordToken } from "@/lib/lemma";
import {
  buildRegenerateMessages,
  parseRegenerateResults,
  MAX_REGENERATE_BATCH_SIZE,
} from "@/lib/regenerateDefinitions";

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.regenerateDefinitions,
      fallbackError: "重新生成释义失败，请稍后重试",
    },
    (raw) => {
      const body = (raw ?? {}) as { words?: unknown };

      if (!Array.isArray(body.words) || body.words.length === 0) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "无效单词列表" },
            { status: 400 }
          ),
        };
      }

      if (body.words.length > MAX_REGENERATE_BATCH_SIZE) {
        return {
          ok: false,
          response: NextResponse.json({ error: "单词数量过多" }, { status: 400 }),
        };
      }

      const words: string[] = [];
      for (const rawWord of body.words) {
        const word =
          typeof rawWord === "string" ? rawWord.trim().toLowerCase() : "";
        if (isValidWordToken(word)) {
          words.push(word);
        }
      }

      if (words.length === 0) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "无效单词列表" },
            { status: 400 }
          ),
        };
      }

      return { ok: true, body: Array.from(new Set(words)) };
    },
    async (uniqueWords) => {
      const raw = await chatCompletionJson<unknown>(
        buildRegenerateMessages(uniqueWords),
        { temperature: 0.2 }
      );
      return NextResponse.json({
        results: parseRegenerateResults(raw, uniqueWords),
      });
    }
  );
}
