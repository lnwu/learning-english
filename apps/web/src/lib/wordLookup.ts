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

interface WordLookupResult {
  isWord: boolean;
  lemma: string;
  senses: WordSense[];
  sources: unknown;
}

export const buildWordLookupMessages = (
  word: string,
  candidates: readonly WordSourceCandidate[] = [],
): ChatMessage[] => {
  const hasCandidates = candidates.length > 0;

  return [
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
        hasCandidates
          ? "The user also gives numbered candidate excerpts (0-based) taken from real sources. For sources, pick at most one candidate per sense and per source kind, and only when the excerpt actually shows that sense's meaning. Use each candidate at most once, only use candidate numbers that appear in the list, and never invent or rewrite excerpts."
          : "sources must be an empty array.",
        'Return JSON only, with no other fields or explanations: {"isWord": true|false, "lemma": "...", "senses": [{"pos": "...", "chinese": "...", "english": "..."}], "sources": [{"candidate": 0, "sense": 0}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: hasCandidates
        ? [
            `Word: ${word}`,
            "Candidates:",
            ...candidates.map(
              (candidate, index) => `${index}. [${candidate.kind}] ${candidate.excerpt}`,
            ),
          ].join("\n")
        : word,
    },
  ];
};

const parseSourcePicks = (
  raw: unknown,
  senses: readonly WordSense[],
  candidates: readonly WordSourceCandidate[],
): WordSource[] => {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const sources: WordSource[] = [];
  for (const item of raw) {
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

export const parseWordLookupResult = (
  raw: unknown,
  word: string,
  candidates: readonly WordSourceCandidate[] = [],
): TranslationCacheEntry => {
  const result = (raw ?? {}) as Partial<WordLookupResult>;
  const lemma = sanitizeLemma(result.lemma, word);

  if (result.isWord !== true) {
    return { lemma, senses: null, sources: [] };
  }

  const senses = sanitizeWordSenses(result.senses);
  if (senses.length === 0) {
    throw new AiServiceError("AI 服务返回内容异常", 502);
  }

  return { lemma, senses, sources: parseSourcePicks(result.sources, senses, candidates) };
};

export const lookupWord = async (
  word: string,
  model?: string,
  candidates: readonly WordSourceCandidate[] = [],
): Promise<TranslationCacheEntry> =>
  parseWordLookupResult(
    await chatCompletionJson<unknown>(buildWordLookupMessages(word, candidates), {
      temperature: 0.2,
      maxOutputTokens: 8192,
      timeoutMs: 60_000,
      model,
    }),
    word,
    candidates,
  );
