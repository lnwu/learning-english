import { NextResponse } from "next/server";
import { API_RATE_LIMITS, withApiPost } from "@/lib/apiRoute";
import { optionalAiModelId, parseBody, wordSenseList, wordToken } from "@/lib/apiInput";
import { chatCompletionJson } from "@/lib/aiClient";
import type { WordSense } from "@/lib/wordSenses";
import { collectWordSourceCandidates } from "@/lib/wordSourceSearch";
import { buildSourceSelectionMessages, parseSourceSelection } from "@/lib/wordSourceSelection";

const parse = parseBody<{ word: string; senses: WordSense[]; model: string }>({
  word: wordToken(),
  senses: wordSenseList(),
  model: optionalAiModelId(),
});

export async function POST(request: Request) {
  return withApiPost(
    request,
    { ...API_RATE_LIMITS.wordSources, fallbackError: "来源查找失败，请稍后重试" },
    parse,
    async ({ word, senses, model }) => {
      const candidates = await collectWordSourceCandidates(word);
      if (candidates.length === 0) {
        return NextResponse.json({ sources: [] });
      }

      const raw = await chatCompletionJson<unknown>(
        buildSourceSelectionMessages(word, senses, candidates),
        { temperature: 0.2, model },
      );
      return NextResponse.json({ sources: parseSourceSelection(raw, senses, candidates) });
    },
  );
}
