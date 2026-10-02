import { extractResultItems, type ChatMessage } from "@/lib/deepseek";
import { LEMMA_EXCEPTION_RULE, LEMMA_REDUCTION_RULE } from "@/lib/aiPrompts";
import { sanitizeLemma } from "@/lib/lemma";

export const MAX_NORMALIZE_BATCH_SIZE = 50;

export interface NormalizeResult {
  word: string;
  lemma: string;
}

export const buildNormalizeMessages = (words: string[]): ChatMessage[] => [
  {
    role: "system",
    content: [
      "你是一位英语词典编辑。用户会给出若干英文单词，请为每个单词给出它的词典原形 lemma。",
      `还原规则：${LEMMA_REDUCTION_RULE}`,
      LEMMA_EXCEPTION_RULE,
      "无法判断或不是有效英文单词时，lemma 返回原词。",
      "必须为列表中的每个单词都返回一条结果，不要遗漏任何单词。",
      '只返回 JSON，不要添加其它字段或解释：{"results": [{"word": "...", "lemma": "..."}]}',
    ].join("\n"),
  },
  { role: "user", content: words.join(", ") },
];

export const parseNormalizeResults = (
  raw: unknown,
  requestedWords: string[],
): NormalizeResult[] => {
  const byWord = new Map<string, string>();
  for (const record of extractResultItems(raw)) {
    const word = typeof record.word === "string" ? record.word.trim().toLowerCase() : "";
    if (!word) continue;
    byWord.set(word, sanitizeLemma(record.lemma, word));
  }

  return requestedWords.map((word) => ({
    word,
    lemma: byWord.get(word) ?? word,
  }));
};
