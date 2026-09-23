import { describe, it, expect } from "bun:test";
import { chunkWords, countFailedWords, runBatchedAiTask } from "./batchAiTask";

describe("chunkWords", () => {
  it("按 batchSize 切分，最后一批可以更短", () => {
    expect(chunkWords(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
  });

  it("空列表返回空数组", () => {
    expect(chunkWords([], 2)).toEqual([]);
  });
});

describe("runBatchedAiTask", () => {
  it("串行执行每批并上报累计进度", async () => {
    const calls: string[][] = [];
    const progress: number[] = [];

    const outcomes = await runBatchedAiTask({
      words: ["a", "b", "c"],
      batchSize: 2,
      runBatch: async (batch) => {
        calls.push(batch);
        return batch.join("-");
      },
      onProgress: (completed) => progress.push(completed),
    });

    expect(calls).toEqual([["a", "b"], ["c"]]);
    expect(progress).toEqual([2, 3]);
    expect(outcomes).toEqual([
      { words: ["a", "b"], result: "a-b" },
      { words: ["c"], result: "c" },
    ]);
  });

  it("单批失败不中断后续批次，错误被记录", async () => {
    const outcomes = await runBatchedAiTask({
      words: ["a", "b", "c"],
      batchSize: 2,
      runBatch: async (batch) => {
        if (batch[0] === "a") throw new Error("boom");
        return "ok";
      },
    });

    expect(outcomes).toHaveLength(2);
    expect("error" in outcomes[0]).toBe(true);
    expect("result" in outcomes[1] && outcomes[1].result).toBe("ok");
  });
});

describe("countFailedWords", () => {
  it("统计失败批次覆盖的单词数", () => {
    expect(
      countFailedWords([
        { words: ["a", "b"], error: new Error("boom") },
        { words: ["c"], result: 1 },
      ])
    ).toBe(2);
  });

  it("全部成功时返回 0", () => {
    expect(countFailedWords([{ words: ["a"], result: 1 }])).toBe(0);
  });
});
