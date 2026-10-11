import {
  LEMMA_EXCEPTION_RULE,
  LEMMA_REDUCTION_RULE,
  SENSE_FIELD_LINES,
  SENSE_SELECTION_RULE,
} from "@/lib/aiPrompts";
import { chatCompletionJson, AiServiceError, type ChatMessage } from "@/lib/aiClient";
import { sanitizeLemma } from "@/lib/lemma";
import { sanitizeWordSenses, type WordSense } from "@/lib/wordSenses";
import type { WordSourceCandidate } from "@/lib/wordSourceSearch";
import type { WordSource } from "@/lib/wordSources";
import type { TranslationCacheEntry } from "@/lib/translationCache";

interface LemmaResult {
  isWord: boolean;
  lemma: string;
}

export const buildLemmaMessages = (word: string): ChatMessage[] => [
  {
    role: "system",
    content: [
      "You analyze English word forms. The user gives you one English word.",
      "isWord is true when it is a real English word, and false when it is a misspelling or an invented word; when false, lemma is the input word.",
      `lemma is the dictionary headword of the word: ${LEMMA_REDUCTION_RULE}`,
      LEMMA_EXCEPTION_RULE,
      'Return JSON only, with no other fields or explanations: {"isWord": true|false, "lemma": "..."}',
    ].join("\n"),
  },
  { role: "user", content: word },
];

export const parseLemmaResult = (raw: unknown, word: string): LemmaResult => {
  const result = (raw ?? {}) as Partial<LemmaResult>;
  return { isWord: result.isWord === true, lemma: sanitizeLemma(result.lemma, word) };
};

export const buildMeaningMessages = (lemma: string): ChatMessage[] => [
  {
    role: "user",
    content: [
      `What does the English word "${lemma}" mean?`,
      SENSE_SELECTION_RULE,
      'Return JSON only, with no other fields or explanations: {"senses": [{"pos": "...", "chinese": "...", "english": "..."}]}',
      "Each sense has:",
      ...SENSE_FIELD_LINES,
    ].join("\n"),
  },
];

export const parseSensesResult = (raw: unknown): WordSense[] => {
  const senses = sanitizeWordSenses((raw as { senses?: unknown } | null)?.senses);
  if (senses.length === 0) {
    throw new AiServiceError("AI 服务返回内容异常", 502);
  }
  return senses;
};

export const buildSourcesMessages = (
  lemma: string,
  senses: readonly WordSense[],
  candidates: readonly WordSourceCandidate[],
): ChatMessage[] => [
  {
    role: "system",
    content: [
      "You match real source excerpts to dictionary senses. The user gives you an English word, its senses as a JSON list (0-based), and numbered candidate excerpts (0-based) taken from real sources.",
      "Pick at most one candidate per sense and per source kind, and only when the excerpt actually shows that sense's meaning. Use each candidate at most once, only use candidate numbers that appear in the list, and never invent or rewrite excerpts.",
      'Return JSON only, with no other fields or explanations: {"sources": [{"candidate": 0, "sense": 0}]}',
    ].join("\n"),
  },
  {
    role: "user",
    content: [
      `Word: ${lemma}`,
      `Senses: ${JSON.stringify(senses)}`,
      "Candidates:",
      ...candidates.map((candidate, index) => `${index}. [${candidate.kind}] ${candidate.excerpt}`),
    ].join("\n"),
  },
];

export const parseSourcesResult = (
  raw: unknown,
  senses: readonly WordSense[],
  candidates: readonly WordSourceCandidate[],
): WordSource[] => {
  const list = (raw as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const sources: WordSource[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const { candidate, sense } = item as { candidate?: unknown; sense?: unknown };
    if (typeof candidate !== "number" || typeof sense !== "number") continue;
    if (!Number.isInteger(candidate) || !Number.isInteger(sense)) continue;
    const picked = candidates[candidate];
    if (!picked || sense < 0 || sense >= senses.length) continue;
    const key = `${sense}:${picked.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      senseIndex: sense,
      kind: picked.kind,
      url: picked.url,
      excerpt: picked.excerpt,
    });
  }

  return sources;
};

export const lookupWord = async (
  word: string,
  model?: string,
  candidates: readonly WordSourceCandidate[] | Promise<readonly WordSourceCandidate[]> = [],
): Promise<TranslationCacheEntry> => {
  const { isWord, lemma } = parseLemmaResult(
    await chatCompletionJson<unknown>(buildLemmaMessages(word), {
      temperature: 0,
      maxOutputTokens: 4096,
      timeoutMs: 30_000,
      model,
    }),
    word,
  );

  if (!isWord) {
    return { lemma, senses: null, sources: [] };
  }

  const senses = parseSensesResult(
    await chatCompletionJson<unknown>(buildMeaningMessages(lemma), {
      temperature: 0.2,
      maxOutputTokens: 4096,
      timeoutMs: 45_000,
      model,
    }),
  );

  const candidateList = await candidates;
  const sources =
    candidateList.length === 0
      ? []
      : parseSourcesResult(
          await chatCompletionJson<unknown>(buildSourcesMessages(lemma, senses, candidateList), {
            temperature: 0,
            maxOutputTokens: 4096,
            timeoutMs: 30_000,
            model,
          }),
          senses,
          candidateList,
        );

  return { lemma, senses, sources };
};
