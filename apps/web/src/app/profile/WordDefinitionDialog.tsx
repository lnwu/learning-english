"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { SenseComparePanel } from "@/components/word/SenseComparePanel";
import { WordSenses } from "@/components/word/WordSenses";
import { toast, useFirestoreWords, useLocale, useSenseCompare } from "@/hooks";
import type { TranslateCompareResult } from "@/lib/translateCompare";

interface WordDefinitionDialogProps {
  word: string | null;
  onClose: () => void;
}

export const WordDefinitionDialog = observer(({ word, onClose }: WordDefinitionDialogProps) => {
  const { words, updateTranslations } = useFirestoreWords();
  const { t } = useLocale();
  const compare = useSenseCompare();
  const [compareOpen, setCompareOpen] = useState(false);
  const [shownWord, setShownWord] = useState(word);

  if (word !== null && word !== shownWord) {
    setShownWord(word);
    setCompareOpen(false);
  }

  const translation = shownWord ? words.getWordData(shownWord)?.translation : undefined;

  const handleUseResult = async (result: TranslateCompareResult) => {
    if (!word || !result.senses || result.senses.length === 0) return;
    try {
      await updateTranslations([{ word, senses: result.senses }]);
      toast({ title: t("profile.regenerateWordSuccess", { word }), variant: "success" });
      setCompareOpen(false);
    } catch (error) {
      console.error("Failed to update translation:", error);
      toast({
        title: error instanceof Error ? error.message : t("profile.regenerateFailed"),
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = () => {
    if (!shownWord) return;
    setCompareOpen(true);
    void compare.generate(
      shownWord,
      compare.models.map((model) => model.id),
    );
  };

  return (
    <Dialog
      open={word !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{shownWord}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <WordSenses translation={translation ?? ""} />
          {compareOpen && shownWord && (
            <SenseComparePanel
              key={shownWord}
              word={shownWord}
              compare={compare}
              onUseResult={handleUseResult}
            />
          )}
        </div>
        <DialogFooter>
          {compareOpen ? (
            <Button variant="outline" onClick={() => setCompareOpen(false)}>
              {t("senses.collapse")}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleRegenerate}>
              {t("profile.regenerateWord")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
