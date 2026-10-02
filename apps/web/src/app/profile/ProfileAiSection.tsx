"use client";

import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, ConfirmDialog } from "@/components/ui";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import { MAX_REGENERATE_BATCH_SIZE, type RegenerateResult } from "@/lib/regenerateDefinitions";
import { countFailedWords, chunkItems, runAiBatches } from "@/lib/batchAiTask";
import type { WordSense } from "@/lib/wordSenses";
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
  const { words, updateTranslations, refreshConfusables } = useFirestoreWords();
  const { t } = useLocale();
  const regenerate = useBatchAiAction(t("profile.regenerateFailed"));
  const confusables = useBatchAiAction(t("profile.confusablesFailed"));

  const totalWords = words.wordCount;

  const handleRegenerateAll = () => {
    const allWords = words.knownWords();
    if (allWords.length === 0) return;

    return regenerate.run(async (onProgress) => {
      const outcomes = await runAiBatches<{ results?: RegenerateResult[] }>({
        batches: chunkItems(allWords, MAX_REGENERATE_BATCH_SIZE),
        runBatch: (batch) =>
          postJson<{ results?: RegenerateResult[] }>(
            "/api/regenerate-definitions",
            { words: batch },
            t("profile.regenerateFailed"),
          ),
        onProgress,
      });

      let success = 0;
      let skipped = 0;
      for (const outcome of outcomes) {
        if ("error" in outcome) {
          console.error("Regenerate batch failed:", outcome.error);
          skipped += outcome.words.length;
          continue;
        }

        const updates: Array<{ word: string; senses: WordSense[] }> = [];
        for (const item of outcome.result.results ?? []) {
          if (item.senses && item.senses.length > 0) {
            updates.push({ word: item.word, senses: item.senses });
            success += 1;
          }
        }
        if (updates.length > 0) {
          await updateTranslations(updates);
        }
        skipped += outcome.words.length - updates.length;
      }

      if (countFailedWords(outcomes) === allWords.length) {
        toast({ title: t("profile.regenerateFailed"), variant: "destructive" });
      } else if (skipped > 0) {
        toast({ title: t("profile.regeneratePartial", { success, skipped }), variant: "success" });
      } else {
        toast({ title: t("profile.regenerateSuccess", { success }), variant: "success" });
      }
    });
  };

  const handleConfusables = () =>
    confusables.run(async (onProgress) => {
      const { updated, failed } = await refreshConfusables({ onProgress });
      if (failed > 0) {
        toast({
          title: t("profile.confusablesPartial", { success: updated, failed }),
          variant: "destructive",
        });
        return;
      }
      toast({
        title:
          updated > 0
            ? t("profile.confusablesSuccess", { count: updated })
            : t("profile.confusablesNone"),
        variant: "success",
      });
    });

  return (
    <>
      <BatchAiActionRow
        action={confusables}
        totalWords={totalWords}
        title={t("profile.confusablesTitle")}
        description={t("profile.confusablesDesc")}
        buttonLabel={t("profile.confusablesButton")}
        confirmTitle={t("profile.confusablesConfirm")}
        confirmDescription={t("profile.confusablesConfirmDesc")}
        onConfirm={handleConfusables}
      />
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
