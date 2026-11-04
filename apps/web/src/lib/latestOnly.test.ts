import { describe, expect, it } from "bun:test";
import { createLatestOnly } from "@/lib/latestOnly";

describe("createLatestOnly", () => {
  it("每次 begin 返回递增的令牌", () => {
    const latest = createLatestOnly();
    expect(latest.begin()).toBe(1);
    expect(latest.begin()).toBe(2);
    expect(latest.begin()).toBe(3);
  });

  it("只有最后一次 begin 的令牌是当前的", () => {
    const latest = createLatestOnly();
    const first = latest.begin();
    const second = latest.begin();
    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(true);
  });

  it("没有 begin 过的令牌都不是当前的", () => {
    const latest = createLatestOnly();
    expect(latest.isCurrent(0)).toBe(false);
    expect(latest.isCurrent(1)).toBe(false);
    latest.begin();
    expect(latest.isCurrent(1)).toBe(true);
    expect(latest.isCurrent(2)).toBe(false);
  });
});
