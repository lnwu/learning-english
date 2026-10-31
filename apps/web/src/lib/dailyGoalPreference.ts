import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { DEFAULT_DAILY_GOAL_MINUTES, normalizeDailyGoalMinutes } from "@/lib/dailyGoal";
import { createLogger } from "@/lib/log";
import { createPreferenceState } from "@/lib/preferenceState";

const log = createLogger({ mod: "preference" });

const DAILY_GOAL_CHANGE_EVENT = "dailygoalchange";

const state = createPreferenceState(DEFAULT_DAILY_GOAL_MINUTES);

const notify = () => {
  window.dispatchEvent(new Event(DAILY_GOAL_CHANGE_EVENT));
};

export const getDailyGoalMinutes = (): number => state.get();

export const subscribeDailyGoal = (listener: () => void): (() => void) => {
  window.addEventListener(DAILY_GOAL_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener(DAILY_GOAL_CHANGE_EVENT, listener);
  };
};

export const loadDailyGoalPreference = async (userId: string): Promise<void> => {
  const token = state.beginLoad(userId);
  if (token === null) return;
  try {
    const snapshot = await getDoc(doc(getDb(), "users", userId));
    const next = normalizeDailyGoalMinutes(snapshot.data()?.dailyGoalMinutes);
    if (state.applyLoad(token, next)) notify();
  } catch (error) {
    state.failLoad(token);
    log.error("preference.failed", "Failed to load daily goal preference", {}, error);
  }
};

export const resetDailyGoalPreference = (): void => {
  if (state.reset()) notify();
};

export const saveDailyGoalPreference = async (userId: string, minutes: number): Promise<void> => {
  const next = normalizeDailyGoalMinutes(minutes);
  if (state.applySave(userId, next)) notify();
  await setDoc(doc(getDb(), "users", userId), { dailyGoalMinutes: next }, { merge: true });
};
