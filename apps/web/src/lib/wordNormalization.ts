import { mergeWordData, type WordData } from "./wordsStore";
import { practiceFields } from "./wordDoc";
import type { WordOperation } from "./wordsRepo";

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

export interface NormalizeDocPlan {
  operations: WordOperation[];
  storeUpdates: Array<{ from: string; to: string; data: WordData }>;
  renamed: number;
  merged: number;
}

export const buildNormalizeDocPlan = (
  plan: WordRename[],
  getData: (word: string) => WordData | undefined
): NormalizeDocPlan => {
  const projected = new Map<string, WordData>();
  const read = (word: string) => projected.get(word) ?? getData(word);
  const operations: WordOperation[] = [];
  const storeUpdates: Array<{ from: string; to: string; data: WordData }> = [];
  let renamed = 0;
  let merged = 0;

  for (const { from, to } of plan) {
    const source = read(from);
    if (!source) continue;
    const target = read(to);

    if (target && target.id !== source.id) {
      const data = mergeWordData(target, source);
      operations.push({
        type: "update",
        wordId: target.id,
        fields: {
          ...practiceFields(data),
          createdAt: data.createdAt,
        },
      });
      operations.push({ type: "delete", wordId: source.id });
      projected.set(to, data);
      projected.delete(from);
      storeUpdates.push({ from, to, data });
      merged += 1;
      continue;
    }

    if (target) continue;

    const data: WordData = { ...source, word: to };
    operations.push({ type: "rename", wordId: source.id, word: to });
    projected.set(to, data);
    projected.delete(from);
    storeUpdates.push({ from, to, data });
    renamed += 1;
  }

  return { operations, storeUpdates, renamed, merged };
};
