import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { DEFAULT_AI_MODEL_ID, normalizeAiModelId } from "@/lib/aiProviders";
import { createLogger } from "@/lib/log";
import { createPreferenceState } from "@/lib/preferenceState";

const log = createLogger({ mod: "preference" });

const AI_MODEL_CHANGE_EVENT = "aimodelchange";

const state = createPreferenceState(DEFAULT_AI_MODEL_ID);

const notify = () => {
  window.dispatchEvent(new Event(AI_MODEL_CHANGE_EVENT));
};

export const getSelectedAiModel = (): string => state.get();

export const subscribeAiModel = (listener: () => void): (() => void) => {
  window.addEventListener(AI_MODEL_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener(AI_MODEL_CHANGE_EVENT, listener);
  };
};

export const loadAiModelPreference = async (userId: string): Promise<void> => {
  const token = state.beginLoad(userId);
  if (token === null) return;
  try {
    const snapshot = await getDoc(doc(getDb(), "users", userId));
    if (state.applyLoad(token, normalizeAiModelId(snapshot.data()?.aiModel))) notify();
  } catch (error) {
    state.failLoad(token);
    log.error("preference.failed", "Failed to load AI model preference", {}, error);
  }
};

export const resetAiModelPreference = (): void => {
  if (state.reset()) notify();
};

export const saveAiModelPreference = async (userId: string, model: string): Promise<void> => {
  if (state.applySave(userId, model)) notify();
  await setDoc(doc(getDb(), "users", userId), { aiModel: model }, { merge: true });
};
