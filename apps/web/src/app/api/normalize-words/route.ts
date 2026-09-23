import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { chatCompletionJson } from "@/lib/deepseek";
import { isValidWordToken } from "@/lib/lemma";
import {
  buildNormalizeMessages,
  parseNormalizeResults,
  MAX_NORMALIZE_BATCH_SIZE,
} from "@/lib/normalizeWords";

export async function POST(request: Request) {
  return withApiPost(
    request,
    {
      ...API_RATE_LIMITS.normalizeWords,
      fallbackError: "归一化单词失败，请稍后重试",
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

      if (body.words.length > MAX_NORMALIZE_BATCH_SIZE) {
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
        buildNormalizeMessages(uniqueWords),
        { temperature: 0.2 }
      );
      return NextResponse.json({
        results: parseNormalizeResults(raw, uniqueWords),
      });
    }
  );
}
