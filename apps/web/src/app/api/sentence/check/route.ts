import { NextResponse } from "next/server";
import { chatCompletionJson, DeepSeekError } from "@/lib/deepseek";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { normalizeForComparison } from "@/lib/sentenceCompare";

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

const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_SENTENCE_LENGTH = 500;
const MAX_WORDS = 5;
const MAX_WORD_LENGTH = 50;

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request);
  if (auth instanceof NextResponse) return auth;

  const rateLimitError = await checkRateLimit(
    `${auth.uid}:sentence/check`,
    RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_WINDOW_MS
  );
  if (rateLimitError) return rateLimitError;

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
        .slice(0, MAX_WORDS)
    : [];

  if (!chinese || !userAnswer) {
    return NextResponse.json({ error: "缺少题目或答案" }, { status: 400 });
  }

  if (
    chinese.length > MAX_SENTENCE_LENGTH ||
    userAnswer.length > MAX_SENTENCE_LENGTH ||
    reference.length > MAX_SENTENCE_LENGTH ||
    words.some((word) => word.length > MAX_WORD_LENGTH)
  ) {
    return NextResponse.json({ error: "输入内容过长" }, { status: 400 });
  }

  const exactMatch =
    reference.length > 0 &&
    normalizeForComparison(userAnswer).length > 0 &&
    normalizeForComparison(userAnswer) === normalizeForComparison(reference);

  if (exactMatch) {
    return NextResponse.json({
      correct: true,
      score: 100,
      feedback: "答案正确，评分已按大小写不敏感处理。",
      corrected: reference,
      issues: [],
    });
  }

  try {
    const result = await chatCompletionJson<CheckResult>([
      {
        role: "system",
        content: [
          "你是一位英语母语者。给定一句中文、需要使用的目标单词、一个参考表达，以及用户写的英文句子，请根据英语母语者的直觉判断这句话是否自然、清晰，以及目标单词的含义和搭配是否使用准确。注意：用户看不到目标单词列表，只能根据中文推断用词。",
          "评分规则：",
          "1. 大小写、标点差异不计入错误。",
          "2. 用户不需要逐字复刻参考表达；即使使用不同的时态、语态、词序或句式，只要意思基本符合中文且表达自然，也应认可，不要像中国英语考试一样要求特定语法形式。",
          "3. 若用户未使用某个目标单词，但使用了自然、准确的同义表达，不要仅因未使用指定单词判错，只需在 feedback 中提示该目标词。",
          "4. 只有语法错误确实影响理解或导致表达不自然时才指出。",
          "只返回 JSON，字段为：correct（布尔值，是否达到自然且正确的表达）、score（0-100 的整数评分）、feedback（用中文给出总体点评与建议）、corrected（修改后的自然英文句子；如果原句已经自然正确则保留原句）、issues（字符串数组，逐条列出影响准确性、自然度或目标单词使用的问题，用中文；若无问题则为空数组）。不要添加其它字段或解释。",
        ].join("\n"),
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
