"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { useEffect, useRef, useState } from "react";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import { encodeSenses, type WordSense } from "@/lib/wordSenses";

interface AddWordDialogProps {
  word: string | null;
  onClose: () => void;
  onFinished?: () => void;
}

type Status = "loading" | "ready" | "exists";

const AddWordDialog = ({ word, onClose, onFinished }: AddWordDialogProps) => {
  const { words, addWord } = useFirestoreWords();
  const { t } = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [senses, setSenses] = useState<WordSense[]>([]);
  const [lemma, setLemma] = useState<string | null>(null);
  const [useOriginal, setUseOriginal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!word) {
      setStatus("loading");
      setSenses([]);
      setLemma(null);
      setUseOriginal(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setStatus("loading");
      setSenses([]);
      setLemma(null);
      setUseOriginal(false);
      const t = tRef.current;
      try {
        const data = await postJson<{
          lemma?: string;
          senses: WordSense[] | null;
        }>("/api/translate", { word }, t("addWord.addFailed"));

        const fetched = data.senses;
        if (!fetched || fetched.length === 0) {
          toast({
            title: t("addWord.notRecognized", { word }),
            variant: "destructive",
          });
          onFinishedRef.current?.();
          return;
        }

        const normalized = data.lemma && data.lemma !== word ? data.lemma : word;
        if (normalized !== word && words.hasWord(normalized)) {
          if (cancelled) return;
          setSenses(fetched);
          setLemma(normalized);
          setStatus("exists");
          return;
        }

        if (cancelled) return;
        setSenses(fetched);
        setLemma(normalized);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to translate word:", error);
        toast({
          title: error instanceof Error ? error.message : t("addWord.addFailed"),
          variant: "destructive",
        });
        onFinishedRef.current?.();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [word, words]);

  const handleConfirmAdd = async () => {
    if (!word || status !== "ready") return;

    const finalWord = useOriginal ? word : (lemma ?? word);

    if (words.hasWord(finalWord)) {
      toast({
        title: tRef.current("addWord.wordExists", { word: finalWord }),
        variant: "destructive",
      });
      onFinishedRef.current?.();
      return;
    }

    setConfirming(true);
    try {
      await addWord(finalWord, senses);
      toast({ title: tRef.current("addWord.addSuccess"), variant: "success" });
      onFinishedRef.current?.();
    } catch (error) {
      console.error("Failed to add word:", error);
      toast({
        title: error instanceof Error ? error.message : tRef.current("addWord.addFailed"),
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
                  onClick={() => setUseOriginal(false)}
                >
                  {t("addWord.saveLemma", { word: lemma })}
                </Button>
                <Button
                  size="sm"
                  variant={useOriginal ? "default" : "outline"}
                  onClick={() => setUseOriginal(true)}
                >
                  {t("addWord.keepOriginal", { word })}
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {status === "exists" ? (
            <Button onClick={() => onFinishedRef.current?.()}>{t("addWord.gotIt")}</Button>
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
