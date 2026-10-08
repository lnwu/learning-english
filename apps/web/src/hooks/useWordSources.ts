"use client";

import { useCallback } from "react";
import { useFirestoreWords } from "@/hooks/useFirestoreWords";
import { postJson } from "@/lib/apiClient";
import type { WordSense } from "@/lib/wordSenses";
import type { WordSource } from "@/lib/wordSources";

interface WordSourceTarget {
  word: string;
  wordId: string;
  senses: WordSense[];
}

export const useWordSources = () => {
  const { attachWordSources } = useFirestoreWords();

  return useCallback(
    async (targets: WordSourceTarget[]) => {
      for (const target of targets) {
        try {
          const { sources } = await postJson<{ sources: WordSource[] }>("/api/word-sources", {
            word: target.word,
            senses: target.senses,
          });
          await attachWordSources({ ...target, sources });
        } catch (error) {
          console.error("Failed to attach word sources:", error);
        }
      }
    },
    [attachWordSources],
  );
};
