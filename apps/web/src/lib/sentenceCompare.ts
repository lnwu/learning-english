export const normalizeForComparison = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const resolveUsedWords = (
  sentence: string,
  words: string[]
): string[] => {
  const tokens = new Set(normalizeForComparison(sentence).split(" "));
  return words.filter((word) => tokens.has(word.toLowerCase()));
};

export const sanitizeUsedWords = (
  usedWords: unknown,
  words: string[]
): string[] => {
  if (!Array.isArray(usedWords)) return words;
  const lowered = new Set(
    usedWords
      .filter((word): word is string => typeof word === "string")
      .map((word) => word.trim().toLowerCase())
  );
  return words.filter((word) => lowered.has(word.toLowerCase()));
};
