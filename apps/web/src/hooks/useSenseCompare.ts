"use client";

import { useCallback, useRef, useState } from "react";
import { useAiModel } from "@/hooks/useAiModel";
import { useLocale } from "@/hooks/useLocale";
import { toast } from "@/hooks/useToast";
import { postApi } from "@/lib/apiClient";
import { createLogger } from "@/lib/log";
import type { AiModelOption } from "@/lib/aiProviders";
import type { TranslateCompareResult } from "@/lib/translateCompare";

const log = createLogger({ mod: "compare" });

export interface SenseCompareState {
  models: AiModelOption[];
  selection: string[];
  results: TranslateCompareResult[] | null;
  comparing: boolean;
  select: (modelIds: string[]) => void;
  toggleModel: (id: string) => void;
  generate: (word: string, modelIds: string[]) => Promise<void>;
}

export const useSenseCompare = (): SenseCompareState => {
  const { models } = useAiModel();
  const { t } = useLocale();
  const [selection, setSelection] = useState<string[]>([]);
  const [results, setResults] = useState<TranslateCompareResult[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const running = useRef(false);

  const select = useCallback((modelIds: string[]) => {
    setSelection(modelIds);
    setResults(null);
  }, []);

  const toggleModel = useCallback((id: string) => {
    setSelection((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const generate = useCallback(
    async (word: string, modelIds: string[]) => {
      if (modelIds.length === 0 || running.current) return;
      running.current = true;
      setSelection(modelIds);
      setComparing(true);
      setResults(null);
      try {
        const data = await postApi<{ results?: TranslateCompareResult[] }>(
          "/api/translate/compare",
          { word, models: modelIds },
          t("senses.compareFailed"),
        );
        setResults(data.results ?? []);
      } catch (error) {
        log.error("api.call.failed", "Failed to compare models", {}, error);
        toast({
          title: error instanceof Error ? error.message : t("senses.compareFailed"),
          variant: "destructive",
        });
      } finally {
        running.current = false;
        setComparing(false);
      }
    },
    [t],
  );

  return { models, selection, results, comparing, select, toggleModel, generate };
};
