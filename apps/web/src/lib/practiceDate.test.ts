import { describe, it, expect } from "bun:test";
import { formatLocalPracticeDate, getLocalPracticeDate } from "./practiceDate";

describe("formatLocalPracticeDate", () => {
  it("格式化为 YYYY-MM-DD", () => {
    const date = new Date(2026, 7, 15, 10, 30);
    expect(formatLocalPracticeDate(date)).toBe("2026-08-15");
  });
});

describe("getLocalPracticeDate", () => {
  it("YYYY-MM-DD 直接返回（避免负时区解析偏移）", () => {
    expect(getLocalPracticeDate("2026-08-15")).toBe("2026-08-15");
  });

  it("ISO 字符串转换为本地日期", () => {
    const iso = new Date(2026, 7, 15, 10, 30).toISOString();
    expect(getLocalPracticeDate(iso)).toBe("2026-08-15");
  });

  it("非法字符串原样返回", () => {
    expect(getLocalPracticeDate("not-a-date")).toBe("not-a-date");
  });
});
