import type { ChatMessage } from "@/lib/deepseek";
import { sanitizeWordSenses } from "@/lib/senses";
import type { WordSense } from "@/lib/parseTranslation";

export const MAX_REGENERATE_BATCH_SIZE = 50;

export interface RegenerateResult {
  word: string;
  senses: WordSense[] | null;
}

export const buildRegenerateMessages = (words: string[]): ChatMessage[] => [
  {
    role: "system",
    content: [
      "你是一位英语词典编辑。用户会给出若干英文单词，请为它们重新生成词典释义。",
      "对每个单词，senses 为该词最常见到较常见的多个义项（通常 2-4 个），最常用的排在最前面；每个义项包含：",
      "1. pos：简短词性标注（如 n.、v.、adj.、adv. 等）；",
      "2. chinese：该义项最常用的中文译法，简洁（不超过 10 个字，有多个常用译法时用顿号分隔）；",
      "3. english：该义项的学习型词典风格简短英文释义，一句话，不超过 15 个单词。",
      "如果某个单词不是有效英文单词（拼写错误或生造词），senses 为 null。",
      "必须为列表中的每个单词都返回一条结果，不要遗漏任何单词。",
      '只返回 JSON，不要添加其它字段或解释：{"results": [{"word": "...", "senses": [{"pos": "...", "chinese": "...", "english": "..."}]}]}',
    ].join("\n"),
  },
  { role: "user", content: words.join(", ") },
];

const sanitizeSenses = (value: unknown): WordSense[] | null => {
  const senses = sanitizeWordSenses(value);
  return senses.length > 0 ? senses : null;
};

export const parseRegenerateResults = (
  raw: unknown,
  requestedWords: string[]
): RegenerateResult[] => {
  const results =
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as { results?: unknown }).results)
      ? (raw as { results: unknown[] }).results
      : [];

  const byWord = new Map<string, WordSense[] | null>();
  for (const item of results) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const word =
      typeof record.word === "string" ? record.word.trim().toLowerCase() : "";
    if (!word) continue;
    byWord.set(word, sanitizeSenses(record.senses));
  }

  return requestedWords.map((word) => ({
    word,
    senses: byWord.has(word) ? byWord.get(word) ?? null : null,
  }));
};
