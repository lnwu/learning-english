"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { SenseComparePanel } from "@/components/word/SenseComparePanel";
import { useEffect, useEffectEvent, useState } from "react";
import {
  useAiModel,
  useDefinitionFlow,
  useFirestoreWords,
  useLocale,
  useSenseCompare,
  toast,
} from "@/hooks";
import { encodeSenses } from "@/lib/wordSenses";
import { type TranslateCompareResult } from "@/lib/translateCompare";

interface AddWordDialogProps {
  word: string | null;
  onClose: () => void;
  onFinished?: () => void;
}

type Status = "loading" | "ready" | "exists";

const AddWordDialog = ({ word, onClose, onFinished }: AddWordDialogProps) => {
  const { words, addWord } = useFirestoreWords();
  const { t } = useLocale();
  const { aiModel } = useAiModel();
  const { loading, data, load, applySenses } = useDefinitionFlow();
  const compare = useSenseCompare();
  const [view, setView] = useState({
    word,
    useOriginal: false,
    existingLemma: null as string | null,
  });
  const [confirming, setConfirming] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareWord, setCompareWord] = useState(word);

  const notifyFinished = useEffectEvent(() => {
    onFinished?.();
  });

  if (view.word !== word) {
    setView({ word, useOriginal: false, existingLemma: null });
  }

  if (compareWord !== word) {
    setCompareWord(word);
    setCompareOpen(false);
  }

  useEffect(() => {
    if (!word) return;

    let cancelled = false;

    const run = async () => {
      const result = await load(word, { fallbackError: t("addWord.addFailed") });
      if (cancelled) return;

      if (!result) {
        notifyFinished();
        return;
      }

      if (!result.recognized) {
        toast({
          title: t("addWord.notRecognized", { word }),
          variant: "destructive",
        });
        notifyFinished();
        return;
      }

      if (result.lemma !== word && words.hasWord(result.lemma)) {
        setView((prev) => (prev.word === word ? { ...prev, existingLemma: result.lemma } : prev));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [word, words, t, load]);

  const current = word && data?.word === word && !loading ? data : null;
  const status: Status = current ? (view.existingLemma ? "exists" : "ready") : "loading";
  const senses = current?.senses ?? [];
  const lemma = current?.lemma ?? null;
  const existingLemma = view.existingLemma;
  const useOriginal = view.useOriginal;
  const isNormalized = Boolean(word && lemma && lemma !== word);

  const handleConfirmAdd = async () => {
    if (!word || !current?.recognized) return;

    const finalWord = useOriginal ? word : current.lemma;

    if (words.hasWord(finalWord)) {
      toast({
        title: t("addWord.wordExists", { word: finalWord }),
        variant: "destructive",
      });
      onFinished?.();
      return;
    }

    setConfirming(true);
    try {
      await addWord(finalWord, current.senses, current.sources);
      toast({ title: t("addWord.addSuccess"), variant: "success" });
      onFinished?.();
    } catch (error) {
      console.error("Failed to add word:", error);
      toast({
        title: error instanceof Error ? error.message : t("addWord.addFailed"),
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
  };

  const handleOpenCompare = () => {
    setCompareOpen(true);
    compare.select(compare.models.filter((model) => model.id !== aiModel).map((model) => model.id));
  };

  const handleUseCompareResult = (result: TranslateCompareResult) => {
    if (!result.senses || result.senses.length === 0) return;
    applySenses(result.senses, result.sources ?? []);
    setView((prev) => ({ ...prev, useOriginal: false }));
    setCompareOpen(false);
  };

  return (
    <Dialog
      open={word !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {status === "exists"
              ? t("addWord.existsTitle")
              : status === "ready" && word
                ? `${t("addWord.confirmTitle")}: ${word}${isNormalized ? ` → ${lemma}` : ""}`
                : t("addWord.title")}
          </DialogTitle>
        </DialogHeader>
        {status === "loading" && (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        )}
        {status === "exists" && word && existingLemma && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {t("addWord.baseExists", { word, lemma: existingLemma })}
            </div>
            <div className="text-sm font-medium">
              {word} → {existingLemma}
            </div>
          </div>
        )}
        {status === "ready" && (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium">{t("addWord.confirmSenses")}</div>
              <div className="text-sm text-muted-foreground whitespace-pre-line">
                {encodeSenses(senses)}
              </div>
            </div>
            {isNormalized && word && lemma && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={useOriginal ? "outline" : "default"}
                  onClick={() => setView((prev) => ({ ...prev, useOriginal: false }))}
                >
                  {t("addWord.saveLemma", { word: lemma })}
                </Button>
                <Button
                  size="sm"
                  variant={useOriginal ? "default" : "outline"}
                  onClick={() => setView((prev) => ({ ...prev, useOriginal: true }))}
                >
                  {t("addWord.keepOriginal", { word })}
                </Button>
              </div>
            )}
            {!compareOpen ? (
              <div>
                <Button size="sm" variant="ghost" onClick={handleOpenCompare}>
                  {t("senses.compare")}
                </Button>
              </div>
            ) : (
              current && (
                <SenseComparePanel
                  key={current.word}
                  word={current.word}
                  compare={compare}
                  showLemma
                  onUseResult={handleUseCompareResult}
                />
              )
            )}
          </div>
        )}
        <DialogFooter>
          {status === "exists" ? (
            <Button onClick={() => onFinished?.()}>{t("addWord.gotIt")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                {t("addWord.cancel")}
              </Button>
              {status === "ready" && (
                <Button onClick={handleConfirmAdd} disabled={confirming}>
                  {t("addWord.confirmAdd")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddWordDialog;
