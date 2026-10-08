"use client";

import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, ConfirmDialog } from "@/components/ui";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import type { WordSense } from "@/lib/wordSenses";
import type { WordSource } from "@/lib/wordSources";
import { SettingRow } from "./SettingRow";

const useBatchAiAction = (fallbackError: string) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const runningRef = useRef(false);

  const run = async (task: (onProgress: (completed: number) => void) => Promise<void>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProgress(0);

    try {
      await task(setProgress);
    } catch (err) {
      console.error(fallbackError, err);
      toast({
        title: err instanceof Error ? err.message : fallbackError,
        variant: "destructive",
      });
    } finally {
      runningRef.current = false;
      setRunning(false);
      setDialogOpen(false);
    }
  };

  return { dialogOpen, setDialogOpen, running, progress, run };
};

type BatchAiAction = ReturnType<typeof useBatchAiAction>;

interface BatchAiActionRowProps {
  action: BatchAiAction;
  totalWords: number;
  title: string;
  description: string;
  buttonLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  onConfirm: () => void;
}

const BatchAiActionRow = ({
  action,
  totalWords,
  title,
  description,
  buttonLabel,
  confirmTitle,
  confirmDescription,
  onConfirm,
}: BatchAiActionRowProps) => {
  const { t } = useLocale();

  return (
    <>
      <SettingRow title={title} description={description}>
        <Button
          variant="outline"
          onClick={() => action.setDialogOpen(true)}
          disabled={action.running || totalWords === 0}
        >
          {action.running
            ? action.progress > 0
              ? `${t("common.loading")} ${action.progress}/${totalWords}`
              : t("common.loading")
            : buttonLabel}
        </Button>
      </SettingRow>
      <ConfirmDialog
        open={action.dialogOpen}
        onOpenChange={action.setDialogOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onConfirm={onConfirm}
      />
    </>
  );
};

export const ProfileAiSection = observer(() => {
  const { words, updateTranslations } = useFirestoreWords();
  const { t } = useLocale();
  const regenerate = useBatchAiAction(t("profile.regenerateFailed"));

  const totalWords = words.wordCount;

  const handleRegenerateAll = () => {
    const allWords = words.knownWords();
    if (allWords.length === 0) return;

    return regenerate.run(async (onProgress) => {
      let success = 0;
      let skipped = 0;
      let failed = 0;

      for (const [index, word] of allWords.entries()) {
        try {
          const result = await postJson<{ senses?: WordSense[] | null; sources?: WordSource[] }>(
            "/api/translate",
            { word, refresh: true },
            t("profile.regenerateFailed"),
          );
          const senses = result.senses ?? [];
          if (senses.length > 0) {
            await updateTranslations([{ word, senses, sources: result.sources ?? [] }]);
            success += 1;
          } else {
            skipped += 1;
          }
        } catch (error) {
          console.error("Regenerate word failed:", error);
          failed += 1;
        }
        onProgress(index + 1);
      }

      if (failed === allWords.length) {
        toast({ title: t("profile.regenerateFailed"), variant: "destructive" });
      } else if (skipped + failed > 0) {
        toast({
          title: t("profile.regeneratePartial", { success, skipped: skipped + failed }),
          variant: "success",
        });
      } else {
        toast({ title: t("profile.regenerateSuccess", { success }), variant: "success" });
      }
    });
  };

  return (
    <>
      <BatchAiActionRow
        action={regenerate}
        totalWords={totalWords}
        title={t("profile.regenerateTitle")}
        description={t("profile.regenerateDesc")}
        buttonLabel={t("profile.regenerateButton")}
        confirmTitle={t("profile.regenerateConfirm")}
        confirmDescription={t("profile.regenerateConfirmDesc")}
        onConfirm={handleRegenerateAll}
      />
    </>
  );
});
