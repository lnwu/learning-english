import { getRedis } from "@/lib/redis";
import type { WordSense } from "@/lib/parseTranslation";

export interface TranslationCacheEntry {
  senses: WordSense[] | null;
}

const MAX_CACHE_ENTRIES = 1000;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const CACHE_KEY_PREFIX = "translation:v1";

const memoryCache = new Map<string, TranslationCacheEntry>();

const isCacheEntry = (value: unknown): value is TranslationCacheEntry =>
  typeof value === "object" && value !== null && "senses" in value;

const readMemory = (word: string): TranslationCacheEntry | undefined => {
  const entry = memoryCache.get(word);
  if (entry) {
    memoryCache.delete(word);
    memoryCache.set(word, entry);
  }
  return entry;
};

const writeMemory = (word: string, entry: TranslationCacheEntry): void => {
  if (!entry.senses || entry.senses.length === 0 || memoryCache.has(word)) {
    return;
  }
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(word, entry);
};

export const getCachedTranslation = async (
  word: string
): Promise<TranslationCacheEntry | undefined> => {
  const memory = readMemory(word);
  if (memory) return memory;

  const redis = getRedis();
  if (!redis) return undefined;

  try {
    const value = await redis.get<TranslationCacheEntry>(
      `${CACHE_KEY_PREFIX}:${word}`
    );
    if (!isCacheEntry(value)) return undefined;
    writeMemory(word, value);
    return value;
  } catch (error) {
    console.error("Failed to read translation cache:", error);
    return undefined;
  }
};

export const setCachedTranslation = (
  word: string,
  entry: TranslationCacheEntry
): void => {
  writeMemory(word, entry);

  if (!entry.senses || entry.senses.length === 0) return;

  const redis = getRedis();
  if (!redis) return;

  redis
    .set(`${CACHE_KEY_PREFIX}:${word}`, entry, { ex: CACHE_TTL_SECONDS })
    .catch((error) => {
      console.error("Failed to write translation cache:", error);
    });
};
