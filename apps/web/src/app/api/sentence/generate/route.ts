import { NextResponse } from "next/server";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";

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
        content:
          "你是一位英语语法教学助手。根据用户提供的英文单词，造一个自然、地道且必须同时包含所有这些单词的英文句子，用于练习语法。句子应体现一个明确的语法点。只返回 JSON，字段为：english（英文句子）、chinese（该句子的中文翻译）、grammarPoint（该句考察的语法点，用中文简要说明）。不要添加其它字段或解释。",
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
