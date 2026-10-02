import { describe, expect, it } from "bun:test";
import { setBounded } from "@/lib/boundedMap";

describe("setBounded", () => {
  it("未满时直接写入", () => {
    const map = new Map<string, number>();
    setBounded(map, "a", 1, 2);
    setBounded(map, "b", 2, 2);
    expect([...map.keys()]).toEqual(["a", "b"]);
  });

  it("已满时淘汰最旧条目", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    setBounded(map, "c", 3, 2);
    expect([...map.keys()]).toEqual(["b", "c"]);
  });

  it("已满时优先清理过期条目", () => {
    const map = new Map([
      ["a", 1],
      ["b", 20],
      ["c", 3],
    ]);
    setBounded(map, "d", 30, 3, (value) => value < 10);
    expect([...map.keys()]).toEqual(["b", "d"]);
  });

  it("更新已有键不触发淘汰", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    setBounded(map, "a", 9, 2);
    expect([...map.entries()]).toEqual([
      ["a", 9],
      ["b", 2],
    ]);
  });
});
