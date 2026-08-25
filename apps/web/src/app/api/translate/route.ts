import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";

const WORD_PATTERN = /^[a-z]+$/;
const MAX_WORD_LENGTH = 50;
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const MAX_SENSES = 4;
const MAX_POS_LENGTH = 10;
const MAX_DEFINITION_LENGTH = 150;
const MAX_TRANSLATION_LENGTH = 50;

interface WordSense {
  pos: string;
  chinese: string;
  english: string;
}

interface TranslationCacheEntry {
  senses: WordSense[] | null;
}

interface WordLookupResult {
  isWord: boolean;
  senses: WordSense[];
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
  if (!entry.senses || entry.senses.length === 0 || translationCache.has(word)) {
    return;
  }
  if (translationCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(word, entry);
}

async function lookupWord(word: string): Promise<TranslationCacheEntry> {
  const result = await chatCompletionJson<WordLookupResult>(
    [
      {
        role: "system",
        content: [
          "你是一位英语词典编辑。用户会给出一个英文单词。",
          "如果它是真实存在的英文单词，isWord 为 true，并返回 senses 数组：按词性/义项列出该词最常见到较常见的多个义项（通常 2-4 个），最常用的义项排在最前面。",
          "每个义项包含：",
          "1. pos：简短词性标注（如 n.、v.、adj.、adv. 等）；",
          "2. chinese：该义项最常用的中文译法，简洁（不超过 10 个字，有多个常用译法时用顿号分隔）；",
          "3. english：该义项的学习型词典风格简短英文释义，一句话，不超过 15 个单词。",
          "如果不是有效英文单词（拼写错误或生造词），isWord 为 false，senses 为空数组。",
          '只返回 JSON，不要添加其它字段或解释：{"isWord": true|false, "senses": [{"pos": "...", "chinese": "...", "english": "..."}]}',
        ].join("\n"),
      },
      { role: "user", content: word },
    ],
    { temperature: 0.2 }
  );

  if (!result?.isWord) {
    return { senses: null };
  }

  const senses = Array.isArray(result.senses)
    ? result.senses
        .slice(0, MAX_SENSES)
        .map((sense) => ({
          pos: typeof sense?.pos === "string" ? sense.pos.trim() : "",
          chinese: typeof sense?.chinese === "string" ? sense.chinese.trim() : "",
          english: typeof sense?.english === "string" ? sense.english.trim() : "",
        }))
        .filter(
          (sense) =>
            sense.pos &&
            sense.pos.length <= MAX_POS_LENGTH &&
            sense.chinese &&
            sense.chinese.length <= MAX_TRANSLATION_LENGTH &&
            sense.english &&
            sense.english.length <= MAX_DEFINITION_LENGTH
        )
    : [];

  if (senses.length === 0) {
    throw new DeepSeekError("AI 服务返回内容异常", 502);
  }

  return { senses };
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

  try {
    const result = await lookupWord(word);
    setCached(word, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("translate lookup failed:", error);
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "翻译失败，请稍后重试" }, { status: 500 });
  }
}
