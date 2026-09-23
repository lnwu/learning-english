import type { WordData } from "@/lib/wordsStore";

export const MIN_SENTENCE_WORDS = 2;
export const MAX_SENTENCE_WORDS = 3;
export const PRIORITIZED_MIN_ATTEMPTS = 3;

export const pickWordCount = (
  rng: () => number,
  {
    min = MIN_SENTENCE_WORDS,
    max = MAX_SENTENCE_WORDS,
  }: { min?: number; max?: number } = {}
): number => Math.floor(rng() * (max - min + 1)) + min;

const shuffle = <T>(items: readonly T[], rng: () => number): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const pickSentenceWords = (
  entries: Array<[string, Readonly<WordData>]>,
  {
    count,
    rng,
    minAttempts = PRIORITIZED_MIN_ATTEMPTS,
  }: { count: number; rng: () => number; minAttempts?: number }
): string[] => {
  if (count <= 0 || entries.length === 0) return [];

  const practiced = entries.filter(
    ([, data]) => data.totalAttempts >= minAttempts
  );
  const lessPracticed = entries.filter(
    ([, data]) => data.totalAttempts < minAttempts
  );

  const prioritized = shuffle(practiced, rng)
    .slice(0, count)
    .map(([word]) => word);
  if (prioritized.length >= count) {
    return prioritized;
  }

  const remaining = count - prioritized.length;
  const fallback = shuffle(lessPracticed, rng)
    .slice(0, remaining)
    .map(([word]) => word);

  return [...prioritized, ...fallback];
};
