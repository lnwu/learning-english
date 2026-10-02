import { describe, it, expect } from "bun:test";
import { formatLocalPracticeDate } from "./practiceDate";

describe("formatLocalPracticeDate", () => {
  it("格式化为 YYYY-MM-DD", () => {
    const date = new Date(2026, 7, 15, 10, 30);
    expect(formatLocalPracticeDate(date)).toBe("2026-08-15");
  });
});
