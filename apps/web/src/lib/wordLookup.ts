import {
  LEMMA_EXCEPTION_RULE,
  LEMMA_REDUCTION_RULE,
  SENSE_FIELD_LINES,
  SENSE_SELECTION_RULE,
} from "@/lib/aiPrompts";
import { chatCompletionJson, AiServiceError, type ChatMessage } from "@/lib/aiClient";
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
      "You are a bilingual English–Chinese dictionary editor. The user gives you one English word.",
      "isWord is true when it is a real English word, and false when it is a misspelling or an invented word; when false, lemma is the input word and senses is an empty array.",
      `lemma is the dictionary headword of the word: ${LEMMA_REDUCTION_RULE}`,
      LEMMA_EXCEPTION_RULE,
      SENSE_SELECTION_RULE,
      "Each sense has:",
      ...SENSE_FIELD_LINES,
      'Return JSON only, with no other fields or explanations: {"isWord": true|false, "lemma": "...", "senses": [{"pos": "...", "chinese": "...", "english": "..."}]}',
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
    throw new AiServiceError("AI 服务返回内容异常", 502);
  }

  return { lemma, senses };
};

export const lookupWord = async (word: string, model?: string): Promise<TranslationCacheEntry> =>
  parseWordLookupResult(
    await chatCompletionJson<unknown>(buildWordLookupMessages(word), {
      temperature: 0.2,
      model,
    }),
    word,
  );
