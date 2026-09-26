import { describe, it, expect } from "bun:test";
import { commitInChunks } from "./chunkedCommit";

describe("commitInChunks", () => {
  it("按 chunkSize 分片，逐片提交并回报成功", async () => {
    const calls: number[][] = [];
    const committed: number[][] = [];

    await commitInChunks({
      items: [1, 2, 3, 4, 5],
      chunkSize: 2,
      commitChunk: async (chunk) => {
        calls.push(chunk);
      },
      onChunkCommitted: (chunk) => {
        committed.push(chunk);
      },
    });

    expect(calls).toEqual([[1, 2], [3, 4], [5]]);
    expect(committed).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("单片失败但提供 onChunkFailed 时，后续分片继续提交", async () => {
    const failures: Array<[number[], unknown]> = [];
    const committed: number[][] = [];

    await commitInChunks({
      items: [1, 2, 3],
      chunkSize: 2,
      commitChunk: async (chunk) => {
        if (chunk[0] === 1) throw new Error("boom");
      },
      onChunkCommitted: (chunk) => {
        committed.push(chunk);
      },
      onChunkFailed: (chunk, error) => {
        failures.push([chunk, error]);
      },
    });

    expect(failures).toHaveLength(1);
    expect(failures[0][0]).toEqual([1, 2]);
    expect((failures[0][1] as Error).message).toBe("boom");
    expect(committed).toEqual([[3]]);
  });

  it("未提供 onChunkFailed 时抛出错误，且不再提交后续分片", async () => {
    const calls: number[][] = [];

    await expect(
      commitInChunks({
        items: [1, 2, 3],
        chunkSize: 2,
        commitChunk: async (chunk) => {
          calls.push(chunk);
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    expect(calls).toEqual([[1, 2]]);
  });

  it("成功回调抛出的错误向外传播，不交给 onChunkFailed", async () => {
    const failures: unknown[] = [];
    const committed: number[][] = [];

    await expect(
      commitInChunks({
        items: [1, 2, 3],
        chunkSize: 2,
        commitChunk: async () => {},
        onChunkCommitted: (chunk) => {
          committed.push(chunk);
          if (chunk[0] === 1) throw new Error("queue failed");
        },
        onChunkFailed: (_chunk, error) => {
          failures.push(error);
        },
      }),
    ).rejects.toThrow("queue failed");

    expect(failures).toEqual([]);
    expect(committed).toEqual([[1, 2]]);
  });

  it("空数组不提交任何分片", async () => {
    const calls: number[][] = [];

    await commitInChunks({
      items: [] as number[],
      chunkSize: 2,
      commitChunk: async (chunk) => {
        calls.push(chunk);
      },
    });

    expect(calls).toEqual([]);
  });
});
