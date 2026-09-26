export const MIN_SENTENCE_WORDS = 2;
export const MAX_SENTENCE_WORDS = 3;

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
  candidates: readonly string[],
  { count, rng }: { count: number; rng: () => number }
): string[] => {
  if (count <= 0 || candidates.length === 0) return [];
  return shuffle(candidates, rng).slice(0, count);
};
