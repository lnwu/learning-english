import type { WordSourceKind } from "@/lib/wordSources";

export interface WordSourceCandidate {
  kind: WordSourceKind;
  url: string;
  excerpt: string;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_RESULTS_PER_SOURCE = 2;
const MIN_EXCERPT_LENGTH = 12;
const MAX_EXCERPT_LENGTH = 200;
const USER_AGENT = "learning-english/1.0";

const ENTITY_MAP: Record<string, string> = {
  "&quot;": '"',
  "&#x27;": "'",
  "&apos;": "'",
  "&hellip;": "…",
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
};

const decodeEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[#\w]+;/g, (entity) => ENTITY_MAP[entity] ?? entity)
    .replace(/&amp;/g, "&");

const cleanText = (value: string): string =>
  decodeEntities(value.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const clip = (value: string): string =>
  value.length > MAX_EXCERPT_LENGTH ? `${value.slice(0, MAX_EXCERPT_LENGTH - 1)}…` : value;

const containsWord = (text: string, word: string): boolean =>
  new RegExp(`\\b${word}\\b`, "i").test(text);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
      )
    : [];

const extractSentence = (text: string, word: string): string => {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const cleaned = cleanText(sentence);
    if (cleaned.length >= MIN_EXCERPT_LENGTH && containsWord(cleaned, word)) {
      return clip(cleaned);
    }
  }
  return "";
};

export const parseWikipediaResults = (raw: unknown, word: string): WordSourceCandidate[] => {
  const search = asArray(asRecord(asRecord(raw).query).search);
  const candidates: WordSourceCandidate[] = [];

  for (const item of search.slice(0, MAX_RESULTS_PER_SOURCE)) {
    const pageId = typeof item.pageid === "number" ? item.pageid : null;
    if (pageId === null) continue;
    const excerpt = extractSentence(typeof item.snippet === "string" ? item.snippet : "", word);
    if (!excerpt) continue;
    candidates.push({
      kind: "wikipedia",
      url: `https://en.wikipedia.org/?curid=${pageId}`,
      excerpt,
    });
  }

  return candidates;
};

export const parseStackExchangeResults = (raw: unknown, word: string): WordSourceCandidate[] => {
  const items = asArray(asRecord(raw).items);
  const candidates: WordSourceCandidate[] = [];

  for (const item of items.slice(0, MAX_RESULTS_PER_SOURCE)) {
    const questionId = typeof item.question_id === "number" ? item.question_id : null;
    if (questionId === null) continue;
    const excerpt = extractSentence(typeof item.excerpt === "string" ? item.excerpt : "", word);
    if (!excerpt) continue;
    candidates.push({
      kind: "stackexchange",
      url: `https://english.stackexchange.com/questions/${questionId}`,
      excerpt,
    });
  }

  return candidates;
};

export const parseUrbanDictionaryResults = (raw: unknown, word: string): WordSourceCandidate[] => {
  const entries = asArray(asRecord(raw).list).sort(
    (a, b) => (Number(b.thumbs_up) || 0) - (Number(a.thumbs_up) || 0),
  );
  const candidates: WordSourceCandidate[] = [];

  for (const item of entries) {
    const permalink = typeof item.permalink === "string" ? item.permalink : "";
    if (!permalink.startsWith("https://")) continue;
    const excerpt = extractSentence(
      typeof item.example === "string" ? item.example.replace(/[[\]]/g, "") : "",
      word,
    );
    if (!excerpt) continue;
    candidates.push({ kind: "urbandictionary", url: permalink, excerpt });
    if (candidates.length >= MAX_RESULTS_PER_SOURCE) break;
  }

  return candidates;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`来源请求失败：${response.status}`);
  }
  return response.json();
};

const searchWikipedia = async (word: string): Promise<WordSourceCandidate[]> =>
  parseWikipediaResults(
    await fetchJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${word}"`)}&srlimit=${MAX_RESULTS_PER_SOURCE}&srprop=snippet&format=json`,
    ),
    word,
  );

const searchStackExchange = async (word: string): Promise<WordSourceCandidate[]> =>
  parseStackExchangeResults(
    await fetchJson(
      `https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${encodeURIComponent(`"${word}"`)}&site=english.stackexchange&pagesize=${MAX_RESULTS_PER_SOURCE}`,
    ),
    word,
  );

const searchUrbanDictionary = async (word: string): Promise<WordSourceCandidate[]> =>
  parseUrbanDictionaryResults(
    await fetchJson(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`),
    word,
  );

export const collectWordSourceCandidates = async (word: string): Promise<WordSourceCandidate[]> => {
  const results = await Promise.allSettled([
    searchWikipedia(word),
    searchStackExchange(word),
    searchUrbanDictionary(word),
  ]);

  return results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    console.error("Failed to search word sources:", result.reason);
    return [];
  });
};
