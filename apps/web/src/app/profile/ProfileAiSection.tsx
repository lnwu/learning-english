"use client";

import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, ConfirmDialog } from "@/components/ui";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import {
  MAX_REGENERATE_BATCH_SIZE,
  type RegenerateResult,
} from "@/lib/regenerateDefinitions";
import {
  MAX_NORMALIZE_BATCH_SIZE,
  type NormalizeResult,
} from "@/lib/normalizeWords";
import { resolveRenamePlan } from "@/lib/wordNormalization";
import { countFailedWords, runBatchedAiTask } from "@/lib/batchAiTask";
import type { WordSense } from "@/lib/wordSenses";

export const ProfileAiSection = observer(() => {
  const { words, updateTranslations, normalizeWordForms } = useFirestoreWords();
  const { t } = useLocale();
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState(0);
  const regeneratingRef = useRef(false);
  const [showNormalizeDialog, setShowNormalizeDialog] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeProgress, setNormalizeProgress] = useState(0);
  const normalizingRef = useRef(false);

  const totalWords = words.wordCount;

  const handleRegenerateAll = async () => {
    if (regeneratingRef.current) return;
    regeneratingRef.current = true;

    const allWords = words.knownWords();
    if (allWords.length === 0) {
      regeneratingRef.current = false;
      return;
    }

    setRegenerating(true);
    setRegenerateProgress(0);

    try {
      const outcomes = await runBatchedAiTask({
        words: allWords,
        batchSize: MAX_REGENERATE_BATCH_SIZE,
        runBatch: (batch) =>
          postJson<{ results?: RegenerateResult[] }>(
            "/api/regenerate-definitions",
            { words: batch },
            t("profile.regenerateFailed")
          ),
        onProgress: setRegenerateProgress,
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
            updates.push({
              word: item.word,
              senses: item.senses,
            });
            success += 1;
          }
        }
        if (updates.length > 0) {
          await updateTranslations(updates);
        }
        skipped += outcome.words.length - updates.length;
      }

      if (countFailedWords(outcomes) === allWords.length) {
        toast({
          title: t("profile.regenerateFailed"),
          variant: "destructive",
        });
      } else if (skipped > 0) {
        toast({
          title: t("profile.regeneratePartial", { success, skipped }),
          variant: "success",
        });
      } else {
        toast({
          title: t("profile.regenerateSuccess", { success }),
          variant: "success",
        });
      }
    } catch (err) {
      console.error("Regenerate all failed:", err);
      toast({
        title:
          err instanceof Error ? err.message : t("profile.regenerateFailed"),
        variant: "destructive",
      });
    } finally {
      regeneratingRef.current = false;
      setRegenerating(false);
      setShowRegenerateDialog(false);
    }
  };

  const handleNormalizeWords = async () => {
    if (normalizingRef.current) return;
    normalizingRef.current = true;

    const allWords = words.knownWords();
    if (allWords.length === 0) {
      normalizingRef.current = false;
      return;
    }

    setNormalizing(true);
    setNormalizeProgress(0);

    try {
      const outcomes = await runBatchedAiTask({
        words: allWords,
        batchSize: MAX_NORMALIZE_BATCH_SIZE,
        runBatch: (batch) =>
          postJson<{ results?: NormalizeResult[] }>(
            "/api/normalize-words",
            { words: batch },
            t("profile.normalizeFailed")
          ),
        onProgress: setNormalizeProgress,
      });

      const renames: Array<{ from: string; to: string }> = [];
      for (const outcome of outcomes) {
        if ("error" in outcome) {
          console.error("Normalize batch failed:", outcome.error);
          continue;
        }
        const lemmaByWord = new Map(
          (outcome.result.results ?? []).map((item) => [item.word, item.lemma])
        );
        renames.push(...resolveRenamePlan(outcome.words, lemmaByWord));
      }

      const failedWords = countFailedWords(outcomes);
      if (failedWords === allWords.length) {
        toast({
          title: t("profile.normalizeFailed"),
          variant: "destructive",
        });
        return;
      }

      const { renamed, merged } =
        renames.length > 0
          ? await normalizeWordForms(renames)
          : { renamed: 0, merged: 0 };

      if (failedWords > 0) {
        toast({
          title: t("profile.normalizePartial", {
            renamed,
            merged,
            failed: failedWords,
          }),
          variant: "destructive",
        });
      } else if (renamed === 0 && merged === 0) {
        toast({ title: t("profile.normalizeNone"), variant: "success" });
      } else {
        toast({
          title: t("profile.normalizeSuccess", { renamed, merged }),
          variant: "success",
        });
      }
    } catch (err) {
      console.error("Normalize all failed:", err);
      toast({
        title:
          err instanceof Error ? err.message : t("profile.normalizeFailed"),
        variant: "destructive",
      });
    } finally {
      normalizingRef.current = false;
      setNormalizing(false);
      setShowNormalizeDialog(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{t('profile.regenerateTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('profile.regenerateDesc')}</p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 self-start sm:self-auto"
          onClick={() => setShowRegenerateDialog(true)}
          disabled={regenerating || totalWords === 0}
        >
          {regenerating
            ? `${t('common.loading')} ${regenerateProgress}/${totalWords}`
            : t('profile.regenerateButton')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{t('profile.normalizeTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('profile.normalizeDesc')}</p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 self-start sm:self-auto"
          onClick={() => setShowNormalizeDialog(true)}
          disabled={normalizing || totalWords === 0}
        >
          {normalizing
            ? `${t('common.loading')} ${normalizeProgress}/${totalWords}`
            : t('profile.normalizeButton')}
        </Button>
      </div>

      <ConfirmDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        title={t('profile.regenerateConfirm')}
        description={t('profile.regenerateConfirmDesc')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleRegenerateAll}
        variant="default"
      />

      <ConfirmDialog
        open={showNormalizeDialog}
        onOpenChange={setShowNormalizeDialog}
        title={t('profile.normalizeConfirm')}
        description={t('profile.normalizeConfirmDesc')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleNormalizeWords}
        variant="default"
      />
    </>
  );
});
