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
import { auth } from "@/lib/firebase";
import { formatSenses, type WordSense } from "@/lib/parseTranslation";

interface AddWordDialogProps {
  word: string | null;
  onClose: () => void;
  onFinished?: () => void;
}

type Status = "loading" | "ready";

const AddWordDialog = ({ word, onClose, onFinished }: AddWordDialogProps) => {
  const { words, addWord } = useFirestoreWords();
  const { t } = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [senses, setSenses] = useState<WordSense[]>([]);
  const [confirming, setConfirming] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!word) {
      setStatus("loading");
      setSenses([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setStatus("loading");
      setSenses([]);
      const t = tRef.current;
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          throw new Error(t("error.notAuthenticated"));
        }

        const response = await fetch("/api/translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ word }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            data && typeof data.error === "string"
              ? data.error
              : t("addWord.addFailed")
          );
        }

        const fetched = (data as { senses: WordSense[] | null }).senses;
        if (!fetched || fetched.length === 0) {
          toast({
            title: t("addWord.notRecognized").replace("{word}", word),
            variant: "destructive",
          });
          onFinishedRef.current?.();
          return;
        }

        if (cancelled) return;
        setSenses(fetched);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to translate word:", error);
        toast({
          title:
            error instanceof Error ? error.message : t("addWord.addFailed"),
          variant: "destructive",
        });
        onFinishedRef.current?.();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [word]);

  const handleConfirmAdd = async () => {
    if (!word || status !== "ready") return;

    if (words.wordData.has(word)) {
      toast({
        title: tRef.current("addWord.wordExists").replace("{word}", word),
        variant: "destructive",
      });
      onFinishedRef.current?.();
      return;
    }

    setConfirming(true);
    try {
      await addWord(word, formatSenses(senses));
      toast({ title: tRef.current("addWord.addSuccess"), variant: "success" });
      onFinishedRef.current?.();
    } catch (error) {
      console.error("Failed to add word:", error);
      toast({
        title:
          error instanceof Error
            ? error.message
            : tRef.current("addWord.addFailed"),
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
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
            {status === "ready" && word
              ? `${t("addWord.confirmTitle")}: ${word}`
              : t("addWord.title")}
          </DialogTitle>
        </DialogHeader>
        {status === "loading" && (
          <div className="text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        )}
        {status === "ready" && (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium">
                {t("addWord.confirmSenses")}
              </div>
              <div className="text-sm text-muted-foreground whitespace-pre-line">
                {formatSenses(senses)}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("addWord.cancel")}
          </Button>
          {status === "ready" && (
            <Button onClick={handleConfirmAdd} disabled={confirming}>
              {t("addWord.confirmAdd")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddWordDialog;