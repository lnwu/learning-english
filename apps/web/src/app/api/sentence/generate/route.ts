import { NextResponse } from "next/server";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";

interface GenerateRequest {
  words?: Array<{ word?: string; translation?: string }>;
}

interface GenerateResult {
  chinese: string;
  english: string;
  grammarPoint: string;
}

const MAX_WORDS = 3;
const MIN_WORDS = 1;
const MAX_WORD_LENGTH = 50;
const MAX_TRANSLATION_LENGTH = 200;
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request);
  if (auth instanceof NextResponse) return auth;

  const rateLimitError = await checkRateLimit(
    `${auth.uid}:sentence/generate`,
    RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_WINDOW_MS
  );
  if (rateLimitError) return rateLimitError;

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const words = Array.isArray(body.words)
    ? body.words
        .map((item) => ({
          word: typeof item?.word === "string" ? item.word.trim() : "",
          translation: typeof item?.translation === "string" ? item.translation.trim() : "",
        }))
        .filter((item) => item.word)
        .slice(0, MAX_WORDS)
    : [];

  if (words.length < MIN_WORDS) {
    return NextResponse.json({ error: "缺少单词" }, { status: 400 });
  }

  if (
    words.some(
      (item) =>
        item.word.length > MAX_WORD_LENGTH ||
        item.translation.length > MAX_TRANSLATION_LENGTH
    )
  ) {
    return NextResponse.json({ error: "输入内容过长" }, { status: 400 });
  }

  try {
    const result = await chatCompletionJson<GenerateResult>([
      {
        role: "system",
        content: [
          "你是一位英语语法教学助手。请根据用户提供的英文目标单词，造一个自然、地道、同时包含所有这些单词的英文句子，用于让学生看中文译回英文的练习。",
          "要求：",
          "1. 目标单词必须使用，允许自然的语法变形（如时态、单复数变化）。",
          "2. 句子长度控制在 10-20 个单词，体现一个明确的语法点；语法点尽量多样化，不要总是使用一般现在时简单句。",
          "3. 除目标单词外，其余词汇使用常见基础词汇，避免生僻词和专有名词。",
          "4. chinese 必须是自然地道的现代中文，同时与 english 语义一一对应；不要逐字硬译（翻译腔），也不要意译或添加原文没有的信息。目标词在 chinese 中应使用给定的参考译法，确保学生只看中文（看不到目标单词列表）就能想到并使用这些目标词译回英文。",
          "5. 即使目标词是书面或学术词汇，句子其余部分的表达也要简单日常。",
          "6. grammarPoint 用中文简要说明该句考察的语法点（一句话以内）。",
          '只返回 JSON，格式如下，不要添加其它字段或解释：{"english": "...", "chinese": "...", "grammarPoint": "..."}',
        ].join("\n"),
      },
      {
        role: "user",
        content: `请使用以下单词造句（括号内为该词的参考中文译法）：${words
          .map((item) => (item.translation ? `${item.word}（${item.translation}）` : item.word))
          .join(", ")}`,
      },
    ]);

    return NextResponse.json({
      chinese: result.chinese,
      english: result.english,
      grammarPoint: result.grammarPoint,
      words: words.map((item) => item.word),
    });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "生成失败，请稍后重试" }, { status: 500 });
  }
}
