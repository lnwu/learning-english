export const MIN_SENTENCE_WORDS = 2;
export const MAX_SENTENCE_WORDS = 3;
export const PRIORITIZED_MIN_ATTEMPTS = 3;

export interface SentenceWordCandidate {
  word: string;
  priority: number;
  totalAttempts: number;
}

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

const pickWeightedRandom = <T extends { weight: number }>(
  candidates: readonly T[],
  max: number,
  rng: () => number
): T[] => {
  const available = [...candidates];
  const selected: T[] = [];
  let totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const limit = Math.min(max, available.length);

  for (let i = 0; i < limit; i++) {
    let random = rng() * totalWeight;
    let selectedIndex = available.length - 1;

    for (let j = 0; j < available.length; j++) {
      random -= available[j].weight;
      if (random <= 0) {
        selectedIndex = j;
        break;
      }
    }

    const selectedItem = available[selectedIndex];
    selected.push(selectedItem);
    available.splice(selectedIndex, 1);
    totalWeight -= selectedItem.weight;
  }

  return selected;
};

export const pickSentenceWords = (
  candidates: readonly SentenceWordCandidate[],
  {
    count,
    rng,
    minAttempts = PRIORITIZED_MIN_ATTEMPTS,
  }: { count: number; rng: () => number; minAttempts?: number }
): string[] => {
  if (count <= 0 || candidates.length === 0) return [];

  const practiced = candidates.filter(
    (candidate) => candidate.totalAttempts >= minAttempts
  );
  const lessPracticed = candidates.filter(
    (candidate) => candidate.totalAttempts < minAttempts
  );

  const prioritized = pickWeightedRandom(
    practiced.map(({ word, priority }) => ({ word, weight: priority })),
    count,
    rng
  ).map(({ word }) => word);
  if (prioritized.length >= count) {
    return prioritized;
  }

  const remaining = count - prioritized.length;
  const fallback = shuffle(lessPracticed, rng)
    .slice(0, remaining)
    .map(({ word }) => word);

  return [...prioritized, ...fallback];
};
