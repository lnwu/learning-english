"use client";

import { useCallback } from "react";
import { useFirestoreWords } from "@/hooks/useFirestoreWords";
import { useLocale } from "@/hooks/useLocale";
import { toast } from "@/hooks/useToast";
import { checkWordAddable } from "@/lib/wordSelection";

export const useAddableWordCheck = () => {
  const { words } = useFirestoreWords();
  const { t } = useLocale();

  return useCallback(
    (word: string): boolean => {
      const status = checkWordAddable((candidate) => words.hasWord(candidate), word);
      if (status === "ok") return true;
      toast({
        title: t(status === "exists" ? "addWord.wordExists" : "addWord.invalidChars", { word }),
        variant: "destructive",
      });
      return false;
    },
    [words, t],
  );
};
