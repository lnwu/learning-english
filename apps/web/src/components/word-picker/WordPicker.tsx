"use client";

import { useEffect, useRef, useState } from "react";
import { useFirestoreWords, useLocale, useAuth, toast } from "@/hooks";
import {
  checkWordAddable,
  extractWordFromSelection,
} from "@/lib/wordSelection";
import AddWordDialog from "./AddWordDialog";

const EXCLUDED_SELECTOR =
  'input, textarea, select, [contenteditable], [data-slot="dialog-content"]';

const WordPicker = () => {
  const { user } = useAuth();
  const { words } = useFirestoreWords();
  const { t } = useLocale();
  const [word, setWord] = useState<string | null>(null);
  const wordRef = useRef<string | null>(null);

  useEffect(() => {
    wordRef.current = word;
  }, [word]);

  useEffect(() => {
    const handleDoubleClick = (event: MouseEvent) => {
      if (wordRef.current) return;
      if (!user) return;

      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest(EXCLUDED_SELECTOR)) return;

      const selection = window.getSelection();
      const extracted = extractWordFromSelection(selection?.toString() ?? "");
      if (!extracted) return;

      const status = checkWordAddable(words, extracted);
      if (status === "exists") {
        toast({
          title: t("addWord.wordExists", { word: extracted }),
          variant: "destructive",
        });
        return;
      }
      if (status === "invalid") {
        toast({
          title: t("addWord.invalidChars", { word: extracted }),
          variant: "destructive",
        });
        return;
      }

      setWord(extracted);
    };

    document.addEventListener("dblclick", handleDoubleClick);
    return () => document.removeEventListener("dblclick", handleDoubleClick);
  }, [user, words, t]);

  return (
    <AddWordDialog
      word={word}
      onClose={() => setWord(null)}
      onFinished={() => setWord(null)}
    />
  );
};

export default WordPicker;