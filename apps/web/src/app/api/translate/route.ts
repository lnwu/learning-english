import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { FALLBACK_DICTIONARY } from "@/lib/dictionary";

const WORD_PATTERN = /^[a-z]+$/;

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
  const authError = await verifyFirebaseIdToken(request);
  if (authError) return authError;

  let body: { word?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const word =
    typeof body.word === "string" ? body.word.trim().toLowerCase() : "";

  if (!WORD_PATTERN.test(word)) {
    return NextResponse.json({ error: "无效单词" }, { status: 400 });
  }

  const [chineseTranslation, englishDefinition] = await Promise.all([
    translateToChinese(word),
    getEnglishDefinition(word),
  ]);

  return NextResponse.json({ chineseTranslation, englishDefinition });
}
