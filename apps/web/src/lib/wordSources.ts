import { MAX_SENSES } from "@/lib/wordSenses";

export type WordSourceKind = "wikipedia" | "stackexchange" | "urbandictionary";

export interface WordSource {
  senseIndex: number;
  kind: WordSourceKind;
  title: string;
  url: string;
  excerpt: string;
}

export const MAX_WORD_SOURCES = 3;

const MAX_TITLE_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 300;
const MAX_URL_LENGTH = 500;
const SOURCE_KINDS: readonly WordSourceKind[] = ["wikipedia", "stackexchange", "urbandictionary"];

const isSourceKind = (value: unknown): value is WordSourceKind =>
  SOURCE_KINDS.some((kind) => kind === value);

export const sanitizeWordSources = (value: unknown): WordSource[] => {
  if (!Array.isArray(value)) return [];

  const sources: WordSource[] = [];
  for (const raw of value) {
    if (sources.length >= MAX_WORD_SOURCES) break;
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const senseIndex = typeof record.senseIndex === "number" ? record.senseIndex : -1;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const excerpt = typeof record.excerpt === "string" ? record.excerpt.trim() : "";
    if (
      Number.isInteger(senseIndex) &&
      senseIndex >= 0 &&
      senseIndex < MAX_SENSES &&
      isSourceKind(record.kind) &&
      title &&
      title.length <= MAX_TITLE_LENGTH &&
      url.startsWith("https://") &&
      url.length <= MAX_URL_LENGTH &&
      excerpt &&
      excerpt.length <= MAX_EXCERPT_LENGTH
    ) {
      sources.push({ senseIndex, kind: record.kind, title, url, excerpt });
    }
  }

  return sources;
};
