export interface PracticeInputState {
  timerStartedAt: number | null;
  errorRecorded: boolean;
  completed: boolean;
}

export interface PracticeInputDecision extends PracticeInputState {
  recordCorrect: boolean;
  recordIncorrect: boolean;
  inputTimeSeconds?: number;
}

export const createPracticeInputState = (): PracticeInputState => ({
  timerStartedAt: null,
  errorRecorded: false,
  completed: false,
});

export const evaluatePracticeInput = (
  state: PracticeInputState,
  word: string,
  value: string,
  now: number
): PracticeInputDecision => {
  if (state.completed) {
    return {
      timerStartedAt: state.timerStartedAt,
      errorRecorded: state.errorRecorded,
      completed: state.completed,
      recordCorrect: false,
      recordIncorrect: false,
    };
  }

  let timerStartedAt = state.timerStartedAt;
  if (value.length === 0) {
    timerStartedAt = null;
  } else if (value.length === 1) {
    timerStartedAt = now;
  }

  let errorRecorded = state.errorRecorded;
  let recordIncorrect = false;
  if (value.length >= word.length && value !== word && !errorRecorded) {
    recordIncorrect = true;
    errorRecorded = true;
  } else if (value.length < word.length) {
    errorRecorded = false;
  }

  let recordCorrect = false;
  let inputTimeSeconds: number | undefined;
  let completed = false;
  if (value === word) {
    completed = true;
    if (timerStartedAt !== null) {
      recordCorrect = true;
      inputTimeSeconds = (now - timerStartedAt) / 1000;
      timerStartedAt = null;
    }
  }

  const decision: PracticeInputDecision = {
    timerStartedAt,
    errorRecorded,
    completed,
    recordCorrect,
    recordIncorrect,
  };
  if (inputTimeSeconds !== undefined) {
    decision.inputTimeSeconds = inputTimeSeconds;
  }
  return decision;
};
