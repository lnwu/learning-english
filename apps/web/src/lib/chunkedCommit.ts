export interface ChunkedCommitInput<T> {
  items: T[];
  chunkSize: number;
  commitChunk: (chunk: T[]) => Promise<void>;
  onChunkCommitted?: (chunk: T[]) => void;
  onChunkFailed?: (chunk: T[], error: unknown) => void;
}

export const commitInChunks = async <T>({
  items,
  chunkSize,
  commitChunk,
  onChunkCommitted,
  onChunkFailed,
}: ChunkedCommitInput<T>): Promise<void> => {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const outcome = await commitChunk(chunk).then(
      () => ({ ok: true as const }),
      (error) => ({ ok: false as const, error })
    );

    if (outcome.ok) {
      onChunkCommitted?.(chunk);
      continue;
    }

    if (!onChunkFailed) throw outcome.error;
    onChunkFailed(chunk, outcome.error);
  }
};
