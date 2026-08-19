import { NextResponse } from "next/server";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";

interface GenerateRequest {
  words?: string[];
}

interface GenerateResult {
  chinese: string;
  english: string;
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
        content:
          "你是一位英语母语者。根据用户提供的英文单词，写一个自然、地道、像 native speaker 日常会说的英文句子，并且必须自然地使用所有目标单词。重点是目标单词的准确含义、常见搭配、语气和真实使用场景，不要为了练习某个语法点而刻意使用复杂或不自然的时态、语态或句式。优先选择清晰、简洁、符合真实交流的表达。只返回 JSON，字段为：english（英文句子）、chinese（该句子的中文翻译）。不要添加其它字段或解释。",
      },
      {
        role: "user",
        content: `请使用以下单词造句：${words.join(", ")}`,
      },
    ]);

    return NextResponse.json({
      chinese: result.chinese,
      english: result.english,
      words,
    });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "生成失败，请稍后重试" }, { status: 500 });
  }
}
