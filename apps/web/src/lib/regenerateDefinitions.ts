import { extractResultItems, type ChatMessage } from "@/lib/aiClient";
import { SENSE_FIELD_LINES, SENSE_SELECTION_RULE } from "@/lib/aiPrompts";
import { sanitizeWordSenses, type WordSense } from "@/lib/wordSenses";

export const MAX_REGENERATE_BATCH_SIZE = 10;

export interface RegenerateResult {
  word: string;
  senses: WordSense[] | null;
}

export const buildRegenerateMessages = (words: string[]): ChatMessage[] => [
  {
    role: "system",
    content: [
      "You are a bilingual English–Chinese dictionary editor. The user gives you a list of English words; regenerate the dictionary senses of each word.",
      SENSE_SELECTION_RULE,
      "Each sense has:",
      ...SENSE_FIELD_LINES,
      "If a word is not a real English word (a misspelling or an invented word), its senses is null.",
      "Return one result for every word in the list, without omitting any.",
      'Return JSON only, with no other fields or explanations: {"results": [{"word": "...", "senses": [{"pos": "...", "chinese": "...", "english": "..."}]}]}',
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
  requestedWords: string[],
): RegenerateResult[] => {
  const byWord = new Map<string, WordSense[] | null>();
  for (const record of extractResultItems(raw)) {
    const word = typeof record.word === "string" ? record.word.trim().toLowerCase() : "";
    if (!word) continue;
    byWord.set(word, sanitizeSenses(record.senses));
  }

  return requestedWords.map((word) => ({
    word,
    senses: byWord.get(word) ?? null,
  }));
};
