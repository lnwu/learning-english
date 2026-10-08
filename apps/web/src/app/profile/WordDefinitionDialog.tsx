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
import { WordDefinition } from "@/components/word/WordDefinition";
import {
  toast,
  useAiModel,
  useDefinitionFlow,
  useFirestoreWords,
  useLocale,
  useSenseCompare,
} from "@/hooks";
import type { TranslateCompareResult } from "@/lib/translateCompare";

interface WordDefinitionDialogProps {
  word: string | null;
  onClose: () => void;
}

export const WordDefinitionDialog = observer(({ word, onClose }: WordDefinitionDialogProps) => {
  const { words, updateTranslations } = useFirestoreWords();
  const { t } = useLocale();
  const { aiModel } = useAiModel();
  const { loading, load } = useDefinitionFlow();
  const compare = useSenseCompare();
  const [compareOpen, setCompareOpen] = useState(false);
  const [shownWord, setShownWord] = useState(word);

  if (word !== null && word !== shownWord) {
    setShownWord(word);
    setCompareOpen(false);
  }

  const wordData = shownWord ? words.getWordData(shownWord) : undefined;
  const translation = wordData?.translation;

  const handleUseResult = async (result: TranslateCompareResult) => {
    if (!shownWord || !result.senses || result.senses.length === 0) return;
    try {
      await updateTranslations([{ word: shownWord, senses: result.senses }]);
      toast({ title: t("profile.regenerateWordSuccess", { word: shownWord }), variant: "success" });
      setCompareOpen(false);
    } catch (error) {
      console.error("Failed to update translation:", error);
      toast({
        title: error instanceof Error ? error.message : t("profile.regenerateFailed"),
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = async () => {
    if (!shownWord) return;

    const result = await load(shownWord, {
      refresh: true,
      fallbackError: t("profile.regenerateFailed"),
    });
    if (!result) return;

    if (!result.recognized) {
      toast({
        title: t("addWord.notRecognized", { word: shownWord }),
        variant: "destructive",
      });
      return;
    }

    try {
      await updateTranslations([
        { word: shownWord, senses: result.senses, sources: result.sources },
      ]);
      toast({ title: t("profile.regenerateWordSuccess", { word: shownWord }), variant: "success" });
    } catch (error) {
      console.error("Failed to update translation:", error);
      toast({
        title: error instanceof Error ? error.message : t("profile.regenerateFailed"),
        variant: "destructive",
      });
      return;
    }

    setCompareOpen(true);
    compare.select(compare.models.filter((model) => model.id !== aiModel).map((model) => model.id));
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
          <WordDefinition translation={translation ?? ""} sources={wordData?.sources ?? []} />
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
            <Button variant="outline" onClick={handleRegenerate} disabled={loading}>
              {loading ? t("common.loading") : t("profile.regenerateWord")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
