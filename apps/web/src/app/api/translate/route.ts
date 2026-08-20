import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { FALLBACK_DICTIONARY } from "@/lib/dictionary";

const WORD_PATTERN = /^[a-z]+$/;
const MAX_WORD_LENGTH = 50;
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_CACHE_ENTRIES = 1000;

interface TranslationCacheEntry {
  chineseTranslation: string | null;
  englishDefinition: string | null;
}

const translationCache = new Map<string, TranslationCacheEntry>();

function getCached(word: string): TranslationCacheEntry | undefined {
  const entry = translationCache.get(word);
  if (entry) {
    translationCache.delete(word);
    translationCache.set(word, entry);
  }
  return entry;
}

function setCached(word: string, entry: TranslationCacheEntry): void {
  if (translationCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(word, entry);
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateToChinese(word: string): Promise<string | null> {
  const response = await fetchWithTimeout(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(word)}`
  );
  if (response?.ok) {
    try {
      const data = await response.json();
      const translation = data?.[0]?.[0]?.[0] ?? null;
      if (translation && translation !== word) {
        return translation;
      }
    } catch {
      // fall through to dictionary
    }
  }
  return FALLBACK_DICTIONARY[word] ?? null;
}

async function getEnglishDefinition(word: string): Promise<string | null> {
  const response = await fetchWithTimeout(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=10`
  );
  if (!response?.ok) {
    return null;
  }
  try {
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

  const rateLimitError = await checkRateLimit(
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

  const cached = getCached(word);
  if (cached) {
    return NextResponse.json(cached);
  }

  const [chineseTranslation, englishDefinition] = await Promise.all([
    translateToChinese(word),
    getEnglishDefinition(word),
  ]);

  const result: TranslationCacheEntry = { chineseTranslation, englishDefinition };
  setCached(word, result);

  return NextResponse.json(result);
}
