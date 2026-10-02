import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { DEFAULT_AI_MODEL_ID } from "@/lib/aiProviders";

const AI_MODEL_CHANGE_EVENT = "aimodelchange";

let current = DEFAULT_AI_MODEL_ID;
let loadedFor: string | null = null;

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
  if (loadedFor === userId) return;
  loadedFor = userId;

  try {
    const snapshot = await getDoc(doc(getDb(), "users", userId));
    const value = snapshot.data()?.aiModel;
    const next = typeof value === "string" && value ? value : DEFAULT_AI_MODEL_ID;
    if (next !== current) {
      current = next;
      notify();
    }
  } catch (error) {
    console.error("Failed to load AI model preference:", error);
  }
};

export const resetAiModelPreference = (): void => {
  loadedFor = null;
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
