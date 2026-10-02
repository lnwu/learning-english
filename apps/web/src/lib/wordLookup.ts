import { LEMMA_EXCEPTION_RULE, LEMMA_REDUCTION_RULE, SENSE_FIELD_LINES } from "@/lib/aiPrompts";
import { chatCompletionJson, DeepSeekError, type ChatMessage } from "@/lib/deepseek";
import { sanitizeLemma } from "@/lib/lemma";
import { sanitizeWordSenses, type WordSense } from "@/lib/wordSenses";
import type { TranslationCacheEntry } from "@/lib/translationCache";

interface WordLookupResult {
  isWord: boolean;
  lemma: string;
  senses: WordSense[];
}

export const buildWordLookupMessages = (word: string): ChatMessage[] => [
  {
    role: "system",
    content: [
      "你是一位英语词典编辑。用户会给出一个英文单词。",
      "如果它是真实存在的英文单词，isWord 为 true，并返回 lemma 和 senses；如果不是有效英文单词（拼写错误或生造词），isWord 为 false，lemma 返回原词，senses 为空数组。",
      `lemma 是该词的词典原形：${LEMMA_REDUCTION_RULE}`,
      LEMMA_EXCEPTION_RULE,
      "senses 针对 lemma 列出最常见到较常见的多个义项（通常 2-4 个），最常用的义项排在最前面。每个义项包含：",
      ...SENSE_FIELD_LINES,
      '只返回 JSON，不要添加其它字段或解释：{"isWord": true|false, "lemma": "...", "senses": [{"pos": "...", "chinese": "...", "english": "...", "note": "..."}]}',
    ].join("\n"),
  },
  { role: "user", content: word },
];

export const parseWordLookupResult = (raw: unknown, word: string): TranslationCacheEntry => {
  const result = (raw ?? {}) as Partial<WordLookupResult>;
  const lemma = sanitizeLemma(result.lemma, word);

  if (!result.isWord) {
    return { lemma, senses: null };
  }

  const senses = sanitizeWordSenses(result.senses);
  if (senses.length === 0) {
    throw new DeepSeekError("AI 服务返回内容异常", 502);
  }

  return { lemma, senses };
};

export const lookupWord = async (word: string): Promise<TranslationCacheEntry> =>
  parseWordLookupResult(
    await chatCompletionJson<unknown>(buildWordLookupMessages(word), {
      temperature: 0.2,
    }),
    word,
  );
