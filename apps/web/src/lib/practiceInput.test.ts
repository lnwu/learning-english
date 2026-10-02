import { describe, it, expect } from "bun:test";
import {
  createPracticeInputState,
  evaluatePracticeInput,
  resolveReview,
  type PracticeInputDecision,
  type PracticeInputState,
} from "./practiceInput";

const evaluate = (state: PracticeInputState, value: string, now = 1000, word = "apple") =>
  evaluatePracticeInput(state, word, value, now);

const typeWord = (
  state: PracticeInputState,
  word: string,
  start: number,
): PracticeInputDecision => {
  let current = evaluatePracticeInput(state, word, word.slice(0, 1), start);
  for (let index = 1; index < word.length; index += 1) {
    current = evaluatePracticeInput(current, word, word.slice(0, index + 1), start + index * 100);
  }
  return current;
};

describe("evaluatePracticeInput", () => {
  it("逐字符输入从首字符开始计时，答对时返回耗时", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    expect(state.timerStartedAt).toBe(1000);

    state = evaluate(state, "ap", 1100);
    state = evaluate(state, "app", 1200);
    state = evaluate(state, "appl", 1300);
    const done = evaluate(state, "apple", 4500);
    expect(done.recordCorrect).toBe(true);
    expect(done.inputTimeSeconds).toBe(3.5);
    expect(done.timerStartedAt).toBeNull();
  });

  it("答对后清空重打不重复记分", () => {
    let state = typeWord(createPracticeInputState(), "apple", 1000);
    expect(state.recordCorrect).toBe(true);

    state = evaluate(state, "", 5000);
    state = evaluate(state, "a", 6000);
    state = evaluate(state, "apple", 9000);
    expect(state.recordCorrect).toBe(false);
    expect(state.completed).toBe(true);
  });

  it("答对后继续多打字符不再记错误", () => {
    let state = typeWord(createPracticeInputState(), "apple", 1000);
    expect(state.recordCorrect).toBe(true);

    state = evaluate(state, "apples", 2500);
    expect(state.recordIncorrect).toBe(false);
    expect(state.recordCorrect).toBe(false);
  });

  it("粘贴完整单词同样结束本轮计分", () => {
    let state = evaluate(createPracticeInputState(), "apple", 1000);
    expect(state.completed).toBe(true);
    expect(state.recordCorrect).toBe(false);

    state = evaluate(state, "apples", 1500);
    expect(state.recordIncorrect).toBe(false);
  });

  it("首字符后整段插入补全不计正确也不计耗时", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    expect(state.timerStartedAt).toBe(1000);

    state = evaluate(state, "apple", 1200);
    expect(state.completed).toBe(true);
    expect(state.recordCorrect).toBe(false);
    expect(state.inputTimeSeconds).toBeUndefined();
  });

  it("长度达到词长且错误时记一次错误", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    state = evaluate(state, "aple", 2000);
    expect(state.recordIncorrect).toBe(false);

    state = evaluate(state, "aplex", 2500);
    expect(state.recordIncorrect).toBe(true);

    state = evaluate(state, "aplexy", 2600);
    expect(state.recordIncorrect).toBe(false);
  });

  it("删除到长度不足后可再次记录错误", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    state = evaluate(state, "aplex", 2000);
    expect(state.recordIncorrect).toBe(true);

    state = evaluate(state, "aple", 2100);
    state = evaluate(state, "aplex", 2200);
    expect(state.recordIncorrect).toBe(true);
  });

  it("清空输入重置计时", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    state = evaluate(state, "", 1500);
    expect(state.timerStartedAt).toBeNull();

    state = evaluate(state, "a", 2300);
    expect(state.timerStartedAt).toBe(2300);
  });

  it("一次粘贴完整单词没有计时则不记正确", () => {
    const state = evaluate(createPracticeInputState(), "apple", 1000);
    expect(state.recordCorrect).toBe(false);
    expect(state.timerStartedAt).toBeNull();
  });

  it("单字母单词输入即答对", () => {
    const state = evaluate(createPracticeInputState(), "a", 1000, "a");
    expect(state.recordCorrect).toBe(true);
    expect(state.inputTimeSeconds).toBe(0);
  });

  it("易混词前缀不记错误", () => {
    const confusables = ["medication"];
    let state = evaluatePracticeInput(
      createPracticeInputState(),
      "medicine",
      "m",
      1000,
      confusables,
    );
    state = evaluatePracticeInput(state, "medicine", "medicati", 1100, confusables);
    expect(state.recordIncorrect).toBe(false);

    state = evaluatePracticeInput(state, "medicine", "medication", 1200, confusables);
    expect(state.recordIncorrect).toBe(false);
    expect(state.errorRecorded).toBe(false);
    expect(state.completed).toBe(false);
  });

  it("易混词前缀后改回正确单词正常计分", () => {
    const confusables = ["medication"];
    const target = "medicine";
    let state = evaluatePracticeInput(createPracticeInputState(), target, "m", 1000, confusables);
    const prefix = "medicati";
    for (let index = 2; index <= prefix.length; index += 1) {
      state = evaluatePracticeInput(
        state,
        target,
        prefix.slice(0, index),
        1000 + index * 100,
        confusables,
      );
    }
    expect(state.recordIncorrect).toBe(false);

    state = evaluatePracticeInput(state, target, "medic", 2000, confusables);
    for (let index = 6; index <= target.length; index += 1) {
      state = evaluatePracticeInput(
        state,
        target,
        target.slice(0, index),
        2000 + index * 100,
        confusables,
      );
    }
    expect(state.recordCorrect).toBe(true);
    expect(state.inputTimeSeconds).toBe(1.8);
  });

  it("易混词前缀抑制后可再次记录真实错误", () => {
    const confusables = ["medication"];
    let state = evaluatePracticeInput(
      createPracticeInputState(),
      "medicine",
      "medicati",
      1000,
      confusables,
    );
    expect(state.errorRecorded).toBe(false);

    state = evaluatePracticeInput(state, "medicine", "medicatix", 1100, confusables);
    expect(state.recordIncorrect).toBe(true);
  });
});

describe("resolveReview", () => {
  it("逐字答对未用提示记 Good 并带耗时", () => {
    const state = typeWord(createPracticeInputState(), "apple", 1000);
    expect(resolveReview(state, false)).toEqual({
      rating: 3,
      hint: false,
      inputTimeSeconds: 0.4,
    });
  });

  it("用过提示答对记 Hard", () => {
    const state = typeWord(createPracticeInputState(), "apple", 1000);
    const review = resolveReview(state, true);
    expect(review?.rating).toBe(2);
    expect(review?.hint).toBe(true);
    expect(review?.inputTimeSeconds).toBe(0.4);
  });

  it("逐字输入打错记 Again", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    state = evaluate(state, "ap", 1100);
    state = evaluate(state, "app", 1200);
    state = evaluate(state, "appl", 1300);
    state = evaluate(state, "aplex", 1400);
    expect(resolveReview(state, false)).toEqual({ rating: 1, hint: false });
  });

  it("整段插入完成不产生复习", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    state = evaluate(state, "apple", 1100);
    expect(resolveReview(state, false)).toBeNull();
  });

  it("整段插入错误不产生复习", () => {
    const state = evaluate(createPracticeInputState(), "aplex", 1000);
    expect(state.recordIncorrect).toBe(true);
    expect(resolveReview(state, false)).toBeNull();
  });

  it("未完成不产生复习", () => {
    let state = evaluate(createPracticeInputState(), "a", 1000);
    state = evaluate(state, "appl", 1100);
    expect(resolveReview(state, false)).toBeNull();
  });
});
