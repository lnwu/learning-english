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
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import { encodeSenses, type WordSense } from "@/lib/wordSenses";

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

const AddWordDialog = ({ word, onClose, onFinished }: AddWordDialogProps) => {
  const { words, addWord } = useFirestoreWords();
  const { t } = useLocale();
  const [translated, setTranslated] = useState<TranslateResult | null>(null);
  const [useOriginalFor, setUseOriginalFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const notifyFinished = useEffectEvent(() => {
    onFinished?.();
  });

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

        const normalized = data.lemma && data.lemma !== word ? data.lemma : word;
        setTranslated({
          word,
          status: normalized !== word && words.hasWord(normalized) ? "exists" : "ready",
          senses: fetched,
          lemma: normalized,
        });
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
