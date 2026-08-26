import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";
import {
  buildRegenerateMessages,
  parseRegenerateResults,
  MAX_REGENERATE_BATCH_SIZE,
} from "@/lib/regenerateDefinitions";

const WORD_PATTERN = /^[a-z]+$/;
const MAX_WORD_LENGTH = 50;
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request);
  if (auth instanceof NextResponse) return auth;

  const rateLimitError = await checkRateLimit(
    `${auth.uid}:regenerate`,
    RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_WINDOW_MS
  );
  if (rateLimitError) return rateLimitError;

  let body: { words?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  if (!Array.isArray(body.words) || body.words.length === 0) {
    return NextResponse.json({ error: "无效单词列表" }, { status: 400 });
  }
  if (body.words.length > MAX_REGENERATE_BATCH_SIZE) {
    return NextResponse.json({ error: "单词数量过多" }, { status: 400 });
  }

  const words: string[] = [];
  for (const raw of body.words) {
    const word = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (WORD_PATTERN.test(word) && word.length <= MAX_WORD_LENGTH) {
      words.push(word);
    }
  }
  if (words.length === 0) {
    return NextResponse.json({ error: "无效单词列表" }, { status: 400 });
  }
  const uniqueWords = Array.from(new Set(words));

  try {
    const raw = await chatCompletionJson<unknown>(
      buildRegenerateMessages(uniqueWords),
      { temperature: 0.2 }
    );
    return NextResponse.json({
      results: parseRegenerateResults(raw, uniqueWords),
    });
  } catch (error) {
    console.error("regenerate definitions failed:", error);
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "重新生成释义失败，请稍后重试" },
      { status: 500 }
    );
  }
}
