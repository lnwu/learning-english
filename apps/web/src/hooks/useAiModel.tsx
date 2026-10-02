"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import type { FC, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveUserId } from "@/lib/firebase";
import {
  getSelectedAiModel,
  loadAiModelPreference,
  resetAiModelPreference,
  saveAiModelPreference,
  subscribeAiModel,
} from "@/lib/aiModelPreference";
import { DEFAULT_AI_MODEL_ID, type AiModelOption } from "@/lib/aiProviders";

const AiModelsContext = createContext<AiModelOption[]>([]);

export const AiModelsProvider: FC<{ models: AiModelOption[]; children: ReactNode }> = ({
  models,
  children,
}) => {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      void loadAiModelPreference(getEffectiveUserId(user));
    } else {
      resetAiModelPreference();
    }
  }, [user]);

  return <AiModelsContext.Provider value={models}>{children}</AiModelsContext.Provider>;
};

export const useAiModel = () => {
  const models = useContext(AiModelsContext);
  const { user } = useAuth();
  const aiModel = useSyncExternalStore(
    subscribeAiModel,
    getSelectedAiModel,
    () => DEFAULT_AI_MODEL_ID,
  );

  const setAiModel = useCallback(
    async (model: string) => {
      if (!user) return;
      await saveAiModelPreference(getEffectiveUserId(user), model);
    },
    [user],
  );

  return { aiModel, setAiModel, models };
};
