import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";
import { sanitizeLemma } from "@/lib/lemma";
import { sanitizeWordSenses } from "@/lib/senses";
import {
  getCachedTranslation,
  setCachedTranslation,
  type TranslationCacheEntry,
} from "@/lib/translationCache";
import type { WordSense } from "@/lib/parseTranslation";

const WORD_PATTERN = /^[a-z]+$/;
const MAX_WORD_LENGTH = 50;
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

interface WordLookupResult {
  isWord: boolean;
  lemma: string;
  senses: WordSense[];
}

async function lookupWord(word: string): Promise<TranslationCacheEntry> {
  const result = await chatCompletionJson<WordLookupResult>(
    [
      {
        role: "system",
        content: [
          "你是一位英语词典编辑。用户会给出一个英文单词。",
          "如果它是真实存在的英文单词，isWord 为 true，并返回 lemma 和 senses；如果不是有效英文单词（拼写错误或生造词），isWord 为 false，lemma 返回原词，senses 为空数组。",
          "lemma 是该词的词典原形：复数/第三人称单数还原为单数，过去式/过去分词/现在分词还原为动词原形，比较级/最高级还原为原级。",
          "例外：如果给出的拼写本身就是词典中常见的独立词条（例如 excited、tired 这类可作形容词的过去分词，或 left、better 这类独立单词），lemma 直接返回该词本身，不要强行还原。",
          "senses 针对 lemma 列出最常见到较常见的多个义项（通常 2-4 个），最常用的义项排在最前面。每个义项包含：",
          "1. pos：简短词性标注（如 n.、v.、adj.、adv. 等）；",
          "2. chinese：该义项最常用的中文译法，简洁（不超过 10 个字，有多个常用译法时用顿号分隔）；",
          "3. english：该义项的学习型词典风格简短英文释义，一句话，不超过 15 个单词。",
          '只返回 JSON，不要添加其它字段或解释：{"isWord": true|false, "lemma": "...", "senses": [{"pos": "...", "chinese": "...", "english": "..."}]}',
        ].join("\n"),
      },
      { role: "user", content: word },
    ],
    { temperature: 0.2 }
  );

  const lemma = sanitizeLemma(result?.lemma, word);

  if (!result?.isWord) {
    return { lemma, senses: null };
  }

  const senses = sanitizeWordSenses(result.senses);

  if (senses.length === 0) {
    throw new DeepSeekError("AI 服务返回内容异常", 502);
  }

  return { lemma, senses };
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

  const cached = await getCachedTranslation(word);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const result = await lookupWord(word);
    setCachedTranslation(word, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("translate lookup failed:", error);
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "翻译失败，请稍后重试" }, { status: 500 });
  }
}
