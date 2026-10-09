"use client";

import { useCallback, useState } from "react";
import { toast } from "@/hooks/useToast";
import { postApi } from "@/lib/apiClient";
import type { WordSense } from "@/lib/wordSenses";
import type { WordSource } from "@/lib/wordSources";

interface WordDefinitionData {
  word: string;
  lemma: string;
  senses: WordSense[];
  sources: WordSource[];
  recognized: boolean;
}

interface TranslateResponse {
  lemma?: string;
  senses?: WordSense[] | null;
  sources?: WordSource[];
}

interface DefinitionFlow {
  loading: boolean;
  data: WordDefinitionData | null;
  load: (
    word: string,
    options: { refresh?: boolean; fallbackError: string },
  ) => Promise<WordDefinitionData | null>;
  applySenses: (senses: WordSense[], sources: WordSource[]) => void;
}

export const useDefinitionFlow = (): DefinitionFlow => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WordDefinitionData | null>(null);

  const load = useCallback(
    async (
      word: string,
      options: { refresh?: boolean; fallbackError: string },
    ): Promise<WordDefinitionData | null> => {
      setLoading(true);
      try {
        const response = await postApi<TranslateResponse>(
          "/api/translate",
          { word, refresh: options.refresh ?? false },
          options.fallbackError,
        );
        const senses = response.senses ?? [];
        const next: WordDefinitionData = {
          word,
          lemma: response.lemma && response.lemma !== word ? response.lemma : word,
          senses,
          sources: response.sources ?? [],
          recognized: senses.length > 0,
        };
        setData(next);
        return next;
      } catch (error) {
        console.error("Failed to translate word:", error);
        toast({
          title: error instanceof Error ? error.message : options.fallbackError,
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const applySenses = useCallback((senses: WordSense[], sources: WordSource[]) => {
    setData((current) => (current ? { ...current, senses, sources } : current));
  }, []);

  return { loading, data, load, applySenses };
};
