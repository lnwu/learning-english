"use client";

import { useMemo, useState } from "react";
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
import { toast, useFirestoreWords, useLocale, useSenseCompare } from "@/hooks";
import { decodeSenses } from "@/lib/wordSenses";
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
  const senses = useMemo(() => decodeSenses(translation ?? ""), [translation]);
  const hasSense = senses.length > 0;

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
          <div
            className={
              hasSense ? "flex flex-col font-medium" : "text-sm text-muted-foreground italic"
            }
          >
            {hasSense
              ? senses.map((sense, index) => (
                  <span key={index}>
                    {[sense.pos, sense.chinese].filter(Boolean).join(" ")}
                    {sense.english && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        — {sense.english}
                      </span>
                    )}
                  </span>
                ))
              : t("home.noTranslation")}
          </div>
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
