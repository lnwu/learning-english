import type { ChatMessage } from "@/lib/aiClient";
import type { WordSense } from "@/lib/wordSenses";
import type { WordSourceCandidate } from "@/lib/wordSourceSearch";
import { MAX_WORD_SOURCES, type WordSource } from "@/lib/wordSources";

export const buildSourceSelectionMessages = (
  word: string,
  senses: WordSense[],
  candidates: WordSourceCandidate[],
): ChatMessage[] => [
  {
    role: "system",
    content: [
      "You match real English usage excerpts to the dictionary senses of one word.",
      "The user gives the word, its numbered senses (0-based) and numbered candidate excerpts (0-based) taken from real sources.",
      `Pick at most ${MAX_WORD_SOURCES} candidates in total. Pair each picked candidate with the sense whose meaning the excerpt actually shows. Use each candidate at most once.`,
      "Only use candidate numbers that appear in the list. Never invent or rewrite excerpts.",
      'Return JSON only, with no other fields or explanations: {"sources": [{"candidate": 0, "sense": 0}]}. Return {"sources": []} when no candidate fits.',
    ].join("\n"),
  },
  {
    role: "user",
    content: [
      `Word: ${word}`,
      "Senses:",
      ...senses.map((sense, index) => `${index}. ${sense.pos} ${sense.chinese} — ${sense.english}`),
      "Candidates:",
      ...candidates.map((candidate, index) => `${index}. [${candidate.kind}] ${candidate.excerpt}`),
    ].join("\n"),
  },
];

export const parseSourceSelection = (
  raw: unknown,
  senses: WordSense[],
  candidates: WordSourceCandidate[],
): WordSource[] => {
  const list =
    typeof raw === "object" && raw !== null ? (raw as { sources?: unknown }).sources : undefined;
  if (!Array.isArray(list)) return [];

  const used = new Set<number>();
  const picks: WordSource[] = [];
  for (const item of list) {
    if (picks.length >= MAX_WORD_SOURCES) break;
    if (typeof item !== "object" || item === null) continue;
    const { candidate, sense } = item as { candidate?: unknown; sense?: unknown };
    if (typeof candidate !== "number" || typeof sense !== "number") continue;
    if (!Number.isInteger(candidate) || !Number.isInteger(sense)) continue;
    const source = candidates[candidate];
    if (!source || used.has(candidate) || sense < 0 || sense >= senses.length) continue;
    used.add(candidate);
    picks.push({
      senseIndex: sense,
      kind: source.kind,
      title: source.title,
      url: source.url,
      excerpt: source.excerpt,
    });
  }

  return picks;
};
