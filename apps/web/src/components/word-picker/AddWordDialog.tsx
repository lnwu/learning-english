"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { useEffect, useEffectEvent, useState } from "react";
import { useFirestoreWords, useLocale, toast, useAiModel } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import { encodeSenses, type WordSense } from "@/lib/wordSenses";
import { MAX_COMPARE_MODELS, type TranslateCompareResult } from "@/lib/translateCompare";

interface AddWordDialogProps {
  word: string | null;
  onClose: () => void;
  onFinished?: () => void;
}

type Status = "loading" | "ready" | "exists";

interface TranslateResult {
  word: string;
  status: Exclude<Status, "loading">;
  senses: WordSense[];
  lemma: string;
}

const toTranslateResult = (
  source: string,
  senses: WordSense[],
  lemma: string | undefined,
  exists: (word: string) => boolean,
): TranslateResult => {
  const normalized = lemma && lemma !== source ? lemma : source;
  return {
    word: source,
    status: normalized !== source && exists(normalized) ? "exists" : "ready",
    senses,
    lemma: normalized,
  };
};

const AddWordDialog = ({ word, onClose, onFinished }: AddWordDialogProps) => {
  const { words, addWord, refreshConfusables } = useFirestoreWords();
  const { t } = useLocale();
  const { aiModel, models } = useAiModel();
  const [translated, setTranslated] = useState<TranslateResult | null>(null);
  const [useOriginalFor, setUseOriginalFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareResults, setCompareResults] = useState<TranslateCompareResult[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareWord, setCompareWord] = useState(word);

  const notifyFinished = useEffectEvent(() => {
    onFinished?.();
  });

  if (compareWord !== word) {
    setCompareWord(word);
    setCompareOpen(false);
    setCompareResults(null);
    setComparing(false);
  }

  useEffect(() => {
    if (!word) return;

    let cancelled = false;

    const run = async () => {
      try {
        const data = await postJson<{
          lemma?: string;
          senses: WordSense[] | null;
        }>("/api/translate", { word }, t("addWord.addFailed"));

        if (cancelled) return;

        const fetched = data.senses;
        if (!fetched || fetched.length === 0) {
          toast({
            title: t("addWord.notRecognized", { word }),
            variant: "destructive",
          });
          notifyFinished();
          return;
        }

        setTranslated(
          toTranslateResult(word, fetched, data.lemma, (value) => words.hasWord(value)),
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to translate word:", error);
        toast({
          title: error instanceof Error ? error.message : t("addWord.addFailed"),
          variant: "destructive",
        });
        notifyFinished();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [word, words, t]);

  const current = word && translated?.word === word ? translated : null;
  const status: Status = current?.status ?? "loading";
  const senses = current?.senses ?? [];
  const lemma = current?.lemma ?? null;
  const useOriginal = useOriginalFor === word;

  const handleConfirmAdd = async () => {
    if (!word || current?.status !== "ready") return;

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
      await addWord(finalWord, current.senses);
      toast({ title: t("addWord.addSuccess"), variant: "success" });
      onFinished?.();
      void refreshConfusables({ word: finalWord, senses: current.senses })
        .then((updated) => {
          if (updated > 0) {
            toast({
              title: t("addWord.confusablesUpdated", { count: updated }),
              variant: "success",
            });
          }
        })
        .catch((error) => {
          console.error("Failed to refresh confusables:", error);
          toast({ title: t("addWord.confusablesFailed"), variant: "destructive" });
        });
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
    setCompareResults(null);
    setCompareSelection(
      models
        .filter((model) => model.id !== aiModel)
        .slice(0, MAX_COMPARE_MODELS)
        .map((model) => model.id),
    );
  };

  const toggleCompareModel = (id: string) => {
    setCompareSelection((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : prev.length >= MAX_COMPARE_MODELS
          ? prev
          : [...prev, id],
    );
  };

  const handleCompare = async () => {
    if (!word || compareSelection.length === 0 || comparing) return;
    setComparing(true);
    setCompareResults(null);
    try {
      const data = await postJson<{ results?: TranslateCompareResult[] }>(
        "/api/translate/compare",
        { word, models: compareSelection },
        t("addWord.compareFailed"),
      );
      setCompareResults(data.results ?? []);
    } catch (error) {
      console.error("Failed to compare models:", error);
      toast({
        title: error instanceof Error ? error.message : t("addWord.compareFailed"),
        variant: "destructive",
      });
    } finally {
      setComparing(false);
    }
  };

  const handleUseCompareResult = (result: TranslateCompareResult) => {
    if (!word || !result.senses || result.senses.length === 0) return;
    setTranslated(
      toTranslateResult(word, result.senses, result.lemma, (value) => words.hasWord(value)),
    );
    setUseOriginalFor(null);
    setCompareOpen(false);
    setCompareResults(null);
  };

  const isNormalized = Boolean(word && lemma && lemma !== word);

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
        {status === "exists" && word && lemma && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {t("addWord.baseExists", { word, lemma })}
            </div>
            <div className="text-sm font-medium">
              {word} → {lemma}
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
                  onClick={() => setUseOriginalFor(null)}
                >
                  {t("addWord.saveLemma", { word: lemma })}
                </Button>
                <Button
                  size="sm"
                  variant={useOriginal ? "default" : "outline"}
                  onClick={() => setUseOriginalFor(word)}
                >
                  {t("addWord.keepOriginal", { word })}
                </Button>
              </div>
            )}
            {!compareOpen ? (
              <div>
                <Button size="sm" variant="ghost" onClick={handleOpenCompare}>
                  {t("addWord.compare")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap gap-2">
                  {models.map((model) => (
                    <Button
                      key={model.id}
                      size="sm"
                      variant={compareSelection.includes(model.id) ? "default" : "outline"}
                      onClick={() => toggleCompareModel(model.id)}
                    >
                      {model.label}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={handleCompare}
                  disabled={comparing || compareSelection.length === 0}
                >
                  {comparing ? t("addWord.comparing") : t("addWord.compareStart")}
                </Button>
                {compareResults && (
                  <div className="space-y-2">
                    {compareResults.map((result) => {
                      const label =
                        models.find((model) => model.id === result.model)?.label ?? result.model;
                      return (
                        <div key={result.model} className="rounded-md border p-2 text-sm">
                          <div className="font-medium">{label}</div>
                          {result.error ? (
                            <div className="text-destructive">{result.error}</div>
                          ) : result.senses && result.senses.length > 0 ? (
                            <>
                              {result.lemma && result.lemma !== word && (
                                <div className="text-muted-foreground">
                                  {word} → {result.lemma}
                                </div>
                              )}
                              <div className="whitespace-pre-line text-muted-foreground">
                                {encodeSenses(result.senses)}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2"
                                onClick={() => handleUseCompareResult(result)}
                              >
                                {t("addWord.useResult")}
                              </Button>
                            </>
                          ) : (
                            <div className="text-muted-foreground">
                              {t("addWord.compareNotRecognized")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
