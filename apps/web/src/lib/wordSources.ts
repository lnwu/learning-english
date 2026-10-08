import { MAX_SENSES } from "@/lib/wordSenses";

export type WordSourceKind = "wikipedia" | "stackexchange" | "urbandictionary";

export interface WordSource {
  senseIndex: number;
  kind: WordSourceKind;
  url: string;
  excerpt: string;
}

const MAX_EXCERPT_LENGTH = 300;
const MAX_URL_LENGTH = 500;
const SOURCE_KINDS: readonly WordSourceKind[] = ["wikipedia", "stackexchange", "urbandictionary"];

const isSourceKind = (value: unknown): value is WordSourceKind =>
  SOURCE_KINDS.some((kind) => kind === value);

export const sanitizeWordSources = (value: unknown): WordSource[] => {
  if (!Array.isArray(value)) return [];

  const sources: WordSource[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const senseIndex = typeof record.senseIndex === "number" ? record.senseIndex : -1;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const excerpt = typeof record.excerpt === "string" ? record.excerpt.trim() : "";
    if (
      Number.isInteger(senseIndex) &&
      senseIndex >= 0 &&
      senseIndex < MAX_SENSES &&
      isSourceKind(record.kind) &&
      url.startsWith("https://") &&
      url.length <= MAX_URL_LENGTH &&
      excerpt &&
      excerpt.length <= MAX_EXCERPT_LENGTH
    ) {
      const key = `${senseIndex}:${record.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ senseIndex, kind: record.kind, url, excerpt });
    }
  }

  return sources;
};
