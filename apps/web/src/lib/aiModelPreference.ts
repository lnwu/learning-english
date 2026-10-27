import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { DEFAULT_AI_MODEL_ID, normalizeAiModelId } from "@/lib/aiProviders";
import { createLogger } from "@/lib/log";

const log = createLogger({ mod: "preference" });

const AI_MODEL_CHANGE_EVENT = "aimodelchange";

let current = DEFAULT_AI_MODEL_ID;

const notify = () => {
  window.dispatchEvent(new Event(AI_MODEL_CHANGE_EVENT));
};

export const getSelectedAiModel = (): string => current;

export const subscribeAiModel = (listener: () => void): (() => void) => {
  window.addEventListener(AI_MODEL_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener(AI_MODEL_CHANGE_EVENT, listener);
  };
};

export const loadAiModelPreference = async (userId: string): Promise<void> => {
  try {
    const snapshot = await getDoc(doc(getDb(), "users", userId));
    const next = normalizeAiModelId(snapshot.data()?.aiModel);
    if (next !== current) {
      current = next;
      notify();
    }
  } catch (error) {
    log.error("preference.failed", "Failed to load AI model preference", {}, error);
  }
};

export const resetAiModelPreference = (): void => {
  if (current !== DEFAULT_AI_MODEL_ID) {
    current = DEFAULT_AI_MODEL_ID;
    notify();
  }
};

export const saveAiModelPreference = async (userId: string, model: string): Promise<void> => {
  if (model !== current) {
    current = model;
    notify();
  }
  await setDoc(doc(getDb(), "users", userId), { aiModel: model }, { merge: true });
};
