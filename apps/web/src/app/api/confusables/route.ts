import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { optionalWordToken, parseBody, wordSensesList, type WordSensesInput } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/deepseek";
import {
  buildConfusablesMessages,
  parseConfusablesResults,
  MAX_CONFUSABLES_WORDS,
} from "@/lib/confusables";

const parse = parseBody<{ words: WordSensesInput[]; focus: string }>({
  words: wordSensesList({ maxItems: MAX_CONFUSABLES_WORDS }),
  focus: optionalWordToken(),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.confusables, fallbackError: "生成易混词辨析失败，请稍后重试" },
    parse,
    async ({ words, focus }) => {
      if (focus && !words.some((item) => item.word === focus)) {
        return NextResponse.json({ error: "目标单词不在列表中" }, { status: 400 });
      }

      const raw = await chatCompletionJson<unknown>(
        buildConfusablesMessages(words, focus || undefined),
        { temperature: 0.2 },
      );
      return NextResponse.json({
        results: parseConfusablesResults(
          raw,
          words.map((item) => item.word),
        ),
      });
    },
  );
}
