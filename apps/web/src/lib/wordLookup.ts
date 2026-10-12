import { LEMMA_EXCEPTION_RULE, LEMMA_REDUCTION_RULE } from "@/lib/aiPrompts";
import { chatCompletionJson, AiServiceError, type ChatMessage } from "@/lib/aiClient";
import { DEFAULT_AI_MODEL_ID } from "@/lib/aiProviders";
import { sanitizeLemma } from "@/lib/lemma";
import { createLogger } from "@/lib/log";
import { MAX_SENSES, sanitizeWordSenses, type WordSense } from "@/lib/wordSenses";
import type { WordSourceCandidate } from "@/lib/wordSourceSearch";
import type { WordSource } from "@/lib/wordSources";
import type { TranslationCacheEntry } from "@/lib/translationCache";

interface LemmaResult {
  isWord: boolean;
  lemma: string;
}

const log = createLogger({ mod: "translate" });

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
      "If the word also has a widely used meaning in computing or software that a dictionary of computing would list, include that sense. Otherwise do not mention computing.",
      "Do not include proper nouns such as product, company, or tool names.",
      "Keep every English definition to a single sentence under 200 characters, and every Simplified Chinese translation under 40 characters.",
      'Return JSON only: {"senses": [{"pos": "...", "chinese": "...", "english": "..."}]}. Each sense has a pos (n., v., adj., adv., etc.), a short Simplified Chinese translation, and an English definition.',
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

export const buildSelectionMessages = (
  lemma: string,
  senses: readonly WordSense[],
): ChatMessage[] => [
  {
    role: "user",
    content: [
      `Here are senses of the English word "${lemma}" (0-based):`,
      ...senses.map((sense, index) => `${index}. ${sense.pos} ${sense.english}`),
      `Which ${MAX_SENSES} of these senses is an English learner most likely to encounter? Always include a sense marked as specific to a domain such as computing, even when it seems less common than the general senses. Do not pick two senses that express the same meaning. Order them from most to least likely.`,
      'Return JSON only: {"senses": [0, 1, 2]}',
    ].join("\n"),
  },
];

export const parseSelectionResult = (raw: unknown, senseCount: number): number[] | null => {
  const list = (raw as { senses?: unknown } | null)?.senses;
  if (!Array.isArray(list)) return null;

  const picked: number[] = [];
  for (const item of list) {
    if (typeof item !== "number" || !Number.isInteger(item)) continue;
    if (item < 0 || item >= senseCount || picked.includes(item)) continue;
    picked.push(item);
    if (picked.length === MAX_SENSES) break;
  }

  return picked.length > 0 ? picked : null;
};

const selectSenses = async (
  lemma: string,
  senses: readonly WordSense[],
  model?: string,
): Promise<WordSense[]> => {
  if (senses.length <= MAX_SENSES) return [...senses];

  const fields = {
    candidateCount: senses.length,
    model: model || DEFAULT_AI_MODEL_ID,
  };
  let raw: unknown;

  try {
    raw = await chatCompletionJson<unknown>(buildSelectionMessages(lemma, senses), {
      temperature: 0,
      reasoning: "none",
      maxOutputTokens: 1024,
      timeoutMs: 30_000,
      model,
    });
  } catch (error) {
    log.error(
      "sense.select.failed",
      "Sense selection call failed",
      { ...fields, reason: "call_failed" },
      error,
    );
    return senses.slice(0, MAX_SENSES);
  }

  const picked = parseSelectionResult(raw, senses.length);
  if (!picked) {
    log.error("sense.select.failed", "Sense selection returned no usable result", {
      ...fields,
      reason: "invalid_output",
    });
    return senses.slice(0, MAX_SENSES);
  }

  return picked.map((index) => senses[index]);
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

  const rawSenses = await chatCompletionJson<unknown>(buildMeaningMessages(lemma), {
    temperature: 0.2,
    maxOutputTokens: 8192,
    timeoutMs: 60_000,
    model,
  });
  const senses = await selectSenses(lemma, parseSensesResult(rawSenses), model);

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
