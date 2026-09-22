import { mergeWordData, type WordData } from "./wordsStore";

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

export type NormalizeDocOperation =
  | {
      type: "updateStats";
      wordId: string;
      fields: {
        correctCount: number;
        totalAttempts: number;
        inputTimes: number[];
        correctPracticeDates: string[];
        attemptHistory: boolean[];
        lastPracticedAt: Date | null;
        createdAt: Date;
      };
    }
  | { type: "deleteWord"; wordId: string }
  | { type: "renameWord"; wordId: string; word: string };

export interface NormalizeDocPlan {
  operations: NormalizeDocOperation[];
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
  const operations: NormalizeDocOperation[] = [];
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
        type: "updateStats",
        wordId: target.id,
        fields: {
          correctCount: data.correctCount,
          totalAttempts: data.totalAttempts,
          inputTimes: data.inputTimes,
          correctPracticeDates: data.correctPracticeDates,
          attemptHistory: data.attemptHistory,
          lastPracticedAt: data.lastPracticedAt,
          createdAt: data.createdAt,
        },
      });
      operations.push({ type: "deleteWord", wordId: source.id });
      projected.set(to, data);
      projected.delete(from);
      storeUpdates.push({ from, to, data });
      merged += 1;
      continue;
    }

    if (target) continue;

    const data: WordData = { ...source, word: to };
    operations.push({ type: "renameWord", wordId: source.id, word: to });
    projected.set(to, data);
    projected.delete(from);
    storeUpdates.push({ from, to, data });
    renamed += 1;
  }

  return { operations, storeUpdates, renamed, merged };
};
