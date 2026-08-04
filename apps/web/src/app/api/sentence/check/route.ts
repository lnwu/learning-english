import { NextResponse } from "next/server";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";

interface CheckRequest {
  chinese?: string;
  words?: string[];
  userAnswer?: string;
  reference?: string;
}

interface CheckResult {
  correct: boolean;
  score: number;
  feedback: string;
  corrected: string;
  issues: string[];
}

export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const chinese = typeof body.chinese === "string" ? body.chinese.trim() : "";
  const userAnswer = typeof body.userAnswer === "string" ? body.userAnswer.trim() : "";
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  const words = Array.isArray(body.words)
    ? body.words
        .filter((word): word is string => typeof word === "string")
        .map((word) => word.trim())
        .filter(Boolean)
    : [];

  if (!chinese || !userAnswer) {
    return NextResponse.json({ error: "缺少题目或答案" }, { status: 400 });
  }

  try {
    const result = await chatCompletionJson<CheckResult>([
      {
        role: "system",
        content:
          "你是一位严谨的英语语法批改老师。给定一句中文、需要使用的目标单词，以及学生写的英文译句，请判断该英文译句在语法、词汇使用、以及是否正确使用了目标单词方面是否存在问题。只返回 JSON，字段为：correct（布尔值，是否完全正确）、score（0-100 的整数评分）、feedback（用中文给出总体点评与建议）、corrected（修改后的正确英文句子）、issues（字符串数组，逐条列出发现的问题，用中文；若无问题则为空数组）。不要添加其它字段或解释。",
      },
      {
        role: "user",
        content: `中文句子：${chinese}\n目标单词：${words.join(", ")}\n参考译文：${reference}\n学生译文：${userAnswer}`,
      },
    ]);

    return NextResponse.json({
      correct: Boolean(result.correct),
      score: typeof result.score === "number" ? result.score : 0,
      feedback: result.feedback ?? "",
      corrected: result.corrected ?? "",
      issues: Array.isArray(result.issues) ? result.issues : [],
    });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "批改失败，请稍后重试" }, { status: 500 });
  }
}
