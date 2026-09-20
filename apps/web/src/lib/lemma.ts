export const MAX_LEMMA_LENGTH = 50;

const LEMMA_PATTERN = /^[a-z]+$/;

export const sanitizeLemma = (value: unknown, fallback: string): string => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw || raw.length > MAX_LEMMA_LENGTH || !LEMMA_PATTERN.test(raw)) {
    return fallback;
  }
  return raw;
};
