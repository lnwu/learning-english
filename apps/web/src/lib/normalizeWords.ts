import { extractResultItems, type ChatMessage } from "@/lib/aiClient";
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
      "You are a bilingual English–Chinese dictionary editor. The user gives you a list of English words; return the dictionary headword (lemma) of each word.",
      `Reduction rules: ${LEMMA_REDUCTION_RULE}`,
      LEMMA_EXCEPTION_RULE,
      "When you cannot decide, or the word is not a real English word, return the word itself as lemma.",
      "Return one result for every word in the list, without omitting any.",
      'Return JSON only, with no other fields or explanations: {"results": [{"word": "...", "lemma": "..."}]}',
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
