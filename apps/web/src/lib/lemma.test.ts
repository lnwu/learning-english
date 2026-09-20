import { describe, it, expect } from "bun:test";
import { MAX_LEMMA_LENGTH, sanitizeLemma } from "./lemma";

describe("sanitizeLemma", () => {
  it("返回去空格小写的原形", () => {
    expect(sanitizeLemma("  Attacker ", "attackers")).toBe("attacker");
    expect(sanitizeLemma("exist", "existed")).toBe("exist");
  });

  it("原形与原词相同时原样返回", () => {
    expect(sanitizeLemma("excited", "excited")).toBe("excited");
  });

  it("非字符串或空值回退原词", () => {
    expect(sanitizeLemma(null, "existed")).toBe("existed");
    expect(sanitizeLemma(undefined, "existed")).toBe("existed");
    expect(sanitizeLemma(123, "existed")).toBe("existed");
    expect(sanitizeLemma("   ", "existed")).toBe("existed");
  });

  it("含非法字符或超长时回退原词", () => {
    expect(sanitizeLemma("exist!", "existed")).toBe("existed");
    expect(sanitizeLemma("two words", "existed")).toBe("existed");
    expect(sanitizeLemma("中", "existed")).toBe("existed");
    expect(
      sanitizeLemma("x".repeat(MAX_LEMMA_LENGTH + 1), "existed")
    ).toBe("existed");
  });
});
