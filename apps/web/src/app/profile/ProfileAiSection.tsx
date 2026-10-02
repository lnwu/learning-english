"use client";

import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, ConfirmDialog } from "@/components/ui";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import { MAX_REGENERATE_BATCH_SIZE, type RegenerateResult } from "@/lib/regenerateDefinitions";
import { MAX_NORMALIZE_BATCH_SIZE, type NormalizeResult } from "@/lib/normalizeWords";
import { resolveRenamePlan } from "@/lib/wordNormalization";
import { countFailedWords, runBatchedAiTask } from "@/lib/batchAiTask";
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
  const { words, updateTranslations, normalizeWordForms, refreshConfusables } = useFirestoreWords();
  const { t } = useLocale();
  const regenerate = useBatchAiAction(t("profile.regenerateFailed"));
  const normalize = useBatchAiAction(t("profile.normalizeFailed"));
  const confusables = useBatchAiAction(t("profile.confusablesFailed"));

  const totalWords = words.wordCount;

  const handleRegenerateAll = () => {
    const allWords = words.knownWords();
    if (allWords.length === 0) return;

    return regenerate.run(async (onProgress) => {
      const outcomes = await runBatchedAiTask({
        words: allWords,
        batchSize: MAX_REGENERATE_BATCH_SIZE,
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

  const handleNormalizeWords = () => {
    const allWords = words.knownWords();
    if (allWords.length === 0) return;

    return normalize.run(async (onProgress) => {
      const outcomes = await runBatchedAiTask({
        words: allWords,
        batchSize: MAX_NORMALIZE_BATCH_SIZE,
        runBatch: (batch) =>
          postJson<{ results?: NormalizeResult[] }>(
            "/api/normalize-words",
            { words: batch },
            t("profile.normalizeFailed"),
          ),
        onProgress,
      });

      const renames: Array<{ from: string; to: string }> = [];
      for (const outcome of outcomes) {
        if ("error" in outcome) {
          console.error("Normalize batch failed:", outcome.error);
          continue;
        }
        const lemmaByWord = new Map(
          (outcome.result.results ?? []).map((item) => [item.word, item.lemma]),
        );
        renames.push(...resolveRenamePlan(outcome.words, lemmaByWord));
      }

      const failedWords = countFailedWords(outcomes);
      if (failedWords === allWords.length) {
        toast({ title: t("profile.normalizeFailed"), variant: "destructive" });
        return;
      }

      const { renamed, merged } =
        renames.length > 0 ? await normalizeWordForms(renames) : { renamed: 0, merged: 0 };

      if (failedWords > 0) {
        toast({
          title: t("profile.normalizePartial", { renamed, merged, failed: failedWords }),
          variant: "destructive",
        });
      } else if (renamed === 0 && merged === 0) {
        toast({ title: t("profile.normalizeNone"), variant: "success" });
      } else {
        toast({ title: t("profile.normalizeSuccess", { renamed, merged }), variant: "success" });
      }
    });
  };

  const handleConfusables = () =>
    confusables.run(async () => {
      const updated = await refreshConfusables();
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
      <BatchAiActionRow
        action={normalize}
        totalWords={totalWords}
        title={t("profile.normalizeTitle")}
        description={t("profile.normalizeDesc")}
        buttonLabel={t("profile.normalizeButton")}
        confirmTitle={t("profile.normalizeConfirm")}
        confirmDescription={t("profile.normalizeConfirmDesc")}
        onConfirm={handleNormalizeWords}
      />
    </>
  );
});
