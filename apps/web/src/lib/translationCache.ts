import { setBounded } from "@/lib/boundedMap";
import { DEFAULT_AI_MODEL_ID } from "@/lib/aiProviders";
import { getRedis } from "@/lib/redis";
import type { WordSense } from "@/lib/wordSenses";
import type { WordSource } from "@/lib/wordSources";

export interface TranslationCacheEntry {
  lemma: string;
  senses: WordSense[] | null;
  sources: WordSource[];
}

const MAX_CACHE_ENTRIES = 1000;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const CACHE_KEY_PREFIX = "translation:v7";

const memoryCache = new Map<string, TranslationCacheEntry>();

const cacheKey = (word: string, model: string): string =>
  model === DEFAULT_AI_MODEL_ID
    ? `${CACHE_KEY_PREFIX}:${word}`
    : `${CACHE_KEY_PREFIX}:${model}:${word}`;

const isCacheEntry = (value: unknown): value is TranslationCacheEntry =>
  typeof value === "object" &&
  value !== null &&
  "senses" in value &&
  typeof (value as { lemma?: unknown }).lemma === "string";

const readMemory = (key: string): TranslationCacheEntry | undefined => {
  const entry = memoryCache.get(key);
  if (entry) {
    memoryCache.delete(key);
    memoryCache.set(key, entry);
  }
  return entry;
};

const writeMemory = (key: string, entry: TranslationCacheEntry): void => {
  if (!entry.senses || entry.senses.length === 0 || memoryCache.has(key)) {
    return;
  }
  setBounded(memoryCache, key, entry, MAX_CACHE_ENTRIES);
};

export const getCachedTranslation = async (
  word: string,
  model: string = DEFAULT_AI_MODEL_ID,
): Promise<TranslationCacheEntry | undefined> => {
  const key = cacheKey(word, model);
  const memory = readMemory(key);
  if (memory) return memory;

  const redis = getRedis();
  if (!redis) return undefined;

  try {
    const value = await redis.get<TranslationCacheEntry>(key);
    if (!isCacheEntry(value)) return undefined;
    writeMemory(key, value);
    return value;
  } catch (error) {
    console.error("Failed to read translation cache:", error);
    return undefined;
  }
};

export const setCachedTranslation = (
  word: string,
  entry: TranslationCacheEntry,
  model: string = DEFAULT_AI_MODEL_ID,
): void => {
  const key = cacheKey(word, model);
  writeMemory(key, entry);

  if (!entry.senses || entry.senses.length === 0) return;

  const redis = getRedis();
  if (!redis) return;

  redis.set(key, entry, { ex: CACHE_TTL_SECONDS }).catch((error) => {
    console.error("Failed to write translation cache:", error);
  });
};
