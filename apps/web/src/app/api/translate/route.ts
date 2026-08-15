import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { FALLBACK_DICTIONARY } from "@/lib/dictionary";

const WORD_PATTERN = /^[a-z]+$/;
const MAX_WORD_LENGTH = 50;
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

async function translateToChinese(word: string): Promise<string | null> {
  let translation: string | null = null;
  try {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(word)}`
    );
    if (response.ok) {
      const data = await response.json();
      translation = data?.[0]?.[0]?.[0] ?? null;
    }
  } catch {
    translation = null;
  }

  if (translation && translation !== word) {
    return translation;
  }
  return FALLBACK_DICTIONARY[word] ?? null;
}

async function getEnglishDefinition(word: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=10`
    );
    if (!response.ok) {
      return null;
    }
    const data: Array<{ word?: string; defs?: string[] }> =
      await response.json();
    const exactMatch = data.find((item) => item.word?.toLowerCase() === word);
    if (!exactMatch?.defs?.length) {
      return null;
    }
    return exactMatch.defs[0].replace(/^[a-z]\t/, "");
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request);
  if (auth instanceof NextResponse) return auth;

  const rateLimitError = checkRateLimit(
    `${auth.uid}:translate`,
    RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_WINDOW_MS
  );
  if (rateLimitError) return rateLimitError;

  let body: { word?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const word =
    typeof body.word === "string" ? body.word.trim().toLowerCase() : "";

  if (!WORD_PATTERN.test(word) || word.length > MAX_WORD_LENGTH) {
    return NextResponse.json({ error: "无效单词" }, { status: 400 });
  }

  const [chineseTranslation, englishDefinition] = await Promise.all([
    translateToChinese(word),
    getEnglishDefinition(word),
  ]);

  return NextResponse.json({ chineseTranslation, englishDefinition });
}
