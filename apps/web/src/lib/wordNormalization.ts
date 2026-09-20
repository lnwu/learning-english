export interface WordRename {
  from: string;
  to: string;
}

const resolveTarget = (
  word: string,
  lemmaByWord: Map<string, string>
): string | null => {
  const seen = new Set<string>([word]);
  let target = word;

  while (true) {
    const next = lemmaByWord.get(target);
    if (!next || next === target) {
      return target === word ? null : target;
    }
    if (seen.has(next)) return null;
    seen.add(next);
    target = next;
  }
};

export const resolveRenamePlan = (
  words: Iterable<string>,
  lemmaByWord: Map<string, string>
): WordRename[] => {
  const plan: WordRename[] = [];

  for (const word of words) {
    const target = resolveTarget(word, lemmaByWord);
    if (target && target !== word) {
      plan.push({ from: word, to: target });
    }
  }

  return plan;
};
