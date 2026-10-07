import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { DEFAULT_DAILY_GOAL_MINUTES, normalizeDailyGoalMinutes } from "@/lib/dailyGoal";

const DAILY_GOAL_CHANGE_EVENT = "dailygoalchange";

let current = DEFAULT_DAILY_GOAL_MINUTES;
let loadedUserId: string | null = null;

const notify = () => {
  window.dispatchEvent(new Event(DAILY_GOAL_CHANGE_EVENT));
};

export const getDailyGoalMinutes = (): number => current;

export const subscribeDailyGoal = (listener: () => void): (() => void) => {
  window.addEventListener(DAILY_GOAL_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener(DAILY_GOAL_CHANGE_EVENT, listener);
  };
};

export const loadDailyGoalPreference = async (userId: string): Promise<void> => {
  if (loadedUserId === userId) return;
  loadedUserId = userId;
  try {
    const snapshot = await getDoc(doc(getDb(), "users", userId));
    const next = normalizeDailyGoalMinutes(snapshot.data()?.dailyGoalMinutes);
    if (next !== current) {
      current = next;
      notify();
    }
  } catch (error) {
    loadedUserId = null;
    console.error("Failed to load daily goal preference:", error);
  }
};

export const resetDailyGoalPreference = (): void => {
  loadedUserId = null;
  if (current !== DEFAULT_DAILY_GOAL_MINUTES) {
    current = DEFAULT_DAILY_GOAL_MINUTES;
    notify();
  }
};

export const saveDailyGoalPreference = async (userId: string, minutes: number): Promise<void> => {
  const next = normalizeDailyGoalMinutes(minutes);
  loadedUserId = userId;
  if (next !== current) {
    current = next;
    notify();
  }
  await setDoc(doc(getDb(), "users", userId), { dailyGoalMinutes: next }, { merge: true });
};
