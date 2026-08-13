import { NextResponse } from "next/server";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";

interface GenerateRequest {
  words?: string[];
}

interface GenerateResult {
  chinese: string;
  english: string;
  grammarPoint: string;
}

const MAX_WORDS = 3;
const MIN_WORDS = 1;

export async function POST(request: Request) {
  const authError = await verifyFirebaseIdToken(request);
  if (authError) return authError;

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const words = Array.isArray(body.words)
    ? body.words
        .filter((word): word is string => typeof word === "string")
        .map((word) => word.trim())
        .filter(Boolean)
        .slice(0, MAX_WORDS)
    : [];

  if (words.length < MIN_WORDS) {
    return NextResponse.json({ error: "缺少单词" }, { status: 400 });
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
          "4. chinese 必须是 english 的忠实直译，且要自然体现每个目标单词的中文含义，确保学生只看中文（看不到目标单词列表）就能想到并使用这些目标词译回英文；不要意译或添加原文没有的信息。",
          "5. grammarPoint 用中文简要说明该句考察的语法点（一句话以内）。",
          '只返回 JSON，格式如下，不要添加其它字段或解释：{"english": "...", "chinese": "...", "grammarPoint": "..."}',
        ].join("\n"),
      },
      {
        role: "user",
        content: `请使用以下单词造句：${words.join(", ")}`,
      },
    ]);

    return NextResponse.json({
      chinese: result.chinese,
      english: result.english,
      grammarPoint: result.grammarPoint,
      words,
    });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "生成失败，请稍后重试" }, { status: 500 });
  }
}
