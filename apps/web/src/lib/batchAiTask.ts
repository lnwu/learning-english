interface BatchTaskSuccess<T> {
  words: string[];
  result: T;
}

interface BatchTaskFailure {
  words: string[];
  error: unknown;
}

export type BatchTaskOutcome<T> = BatchTaskSuccess<T> | BatchTaskFailure;

export const chunkWords = (
  words: readonly string[],
  batchSize: number
): string[][] => {
  const batches: string[][] = [];
  for (let i = 0; i < words.length; i += batchSize) {
    batches.push(words.slice(i, i + batchSize));
  }
  return batches;
};

export const runBatchedAiTask = async <T>(input: {
  words: readonly string[];
  batchSize: number;
  runBatch: (batch: string[]) => Promise<T>;
  onProgress?: (completed: number) => void;
}): Promise<BatchTaskOutcome<T>[]> => {
  const outcomes: BatchTaskOutcome<T>[] = [];
  let completed = 0;

  for (const batch of chunkWords(input.words, input.batchSize)) {
    try {
      outcomes.push({ words: batch, result: await input.runBatch(batch) });
    } catch (error) {
      outcomes.push({ words: batch, error });
    }
    completed += batch.length;
    input.onProgress?.(completed);
  }

  return outcomes;
};

export const countFailedWords = <T>(
  outcomes: ReadonlyArray<BatchTaskOutcome<T>>
): number =>
  outcomes.reduce(
    (sum, outcome) => ("error" in outcome ? sum + outcome.words.length : sum),
    0
  );
