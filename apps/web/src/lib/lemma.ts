export const MAX_LEMMA_LENGTH = 50;

const LEMMA_PATTERN = /^[a-z]+$/;

export const isValidWordToken = (word: string): boolean =>
  LEMMA_PATTERN.test(word) && word.length <= MAX_LEMMA_LENGTH;

export const sanitizeLemma = (value: unknown, fallback: string): string => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw || raw.length > MAX_LEMMA_LENGTH || !LEMMA_PATTERN.test(raw)) {
    return fallback;
  }
  return raw;
};
