interface BatchTaskSuccess<T> {
  words: string[];
  result: T;
}

interface BatchTaskFailure {
  words: string[];
  error: unknown;
}

export type BatchTaskOutcome<T> = BatchTaskSuccess<T> | BatchTaskFailure;

export const chunkItems = <T>(items: readonly T[], batchSize: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
};

export const runAiBatches = async <T>(input: {
  batches: ReadonlyArray<readonly string[]>;
  runBatch: (batch: string[]) => Promise<T>;
  onProgress?: (completed: number) => void;
}): Promise<BatchTaskOutcome<T>[]> => {
  const outcomes: BatchTaskOutcome<T>[] = [];
  let completed = 0;

  for (const batch of input.batches) {
    const words = [...batch];
    try {
      outcomes.push({ words, result: await input.runBatch(words) });
    } catch (error) {
      outcomes.push({ words, error });
    }
    completed += words.length;
    input.onProgress?.(completed);
  }

  return outcomes;
};

export const countFailedWords = <T>(outcomes: ReadonlyArray<BatchTaskOutcome<T>>): number =>
  outcomes.reduce((sum, outcome) => ("error" in outcome ? sum + outcome.words.length : sum), 0);
