import type { ChatMessage } from "@/lib/deepseek";
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
      "还原规则：复数/第三人称单数还原为单数，过去式/过去分词/现在分词还原为动词原形，比较级/最高级还原为原级。",
      "例外：如果给出的拼写本身就是词典中常见的独立词条（例如 excited、tired 这类可作形容词的过去分词，或 left、better 这类独立单词），lemma 返回该词本身，不要强行还原。",
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
  const results =
    typeof raw === "object" && raw !== null && Array.isArray((raw as { results?: unknown }).results)
      ? (raw as { results: unknown[] }).results
      : [];

  const byWord = new Map<string, string>();
  for (const item of results) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const word = typeof record.word === "string" ? record.word.trim().toLowerCase() : "";
    if (!word) continue;
    byWord.set(word, sanitizeLemma(record.lemma, word));
  }

  return requestedWords.map((word) => ({
    word,
    lemma: byWord.get(word) ?? word,
  }));
};
