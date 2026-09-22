"use client";

import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, ConfirmDialog } from "@/components/ui";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { postJson } from "@/lib/apiClient";
import { formatSenses } from "@/lib/parseTranslation";
import {
  MAX_REGENERATE_BATCH_SIZE,
  type RegenerateResult,
} from "@/lib/regenerateDefinitions";
import {
  MAX_NORMALIZE_BATCH_SIZE,
  type NormalizeResult,
} from "@/lib/normalizeWords";
import { resolveRenamePlan } from "@/lib/wordNormalization";

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

  const totalWords = words.wordData.size;

  const handleRegenerateAll = async () => {
    if (regeneratingRef.current) return;
    regeneratingRef.current = true;

    const allWords = Array.from(words.wordData.keys());
    if (allWords.length === 0) {
      regeneratingRef.current = false;
      return;
    }

    setRegenerating(true);
    setRegenerateProgress(0);
    const total = allWords.length;
    let success = 0;
    let skipped = 0;
    let batchFailed = 0;
    const batches: string[][] = [];

    try {
      for (let i = 0; i < total; i += MAX_REGENERATE_BATCH_SIZE) {
        batches.push(allWords.slice(i, i + MAX_REGENERATE_BATCH_SIZE));
      }

      for (const batch of batches) {
        let batchSuccess = 0;
        try {
          const data = await postJson<{ results?: RegenerateResult[] }>(
            "/api/regenerate-definitions",
            { words: batch },
            t("profile.regenerateFailed")
          );

          const results = data.results ?? [];
          const updates: Array<{ word: string; translation: string }> = [];
          for (const item of results) {
            if (item.senses && item.senses.length > 0) {
              updates.push({ word: item.word, translation: formatSenses(item.senses) });
              batchSuccess += 1;
            }
          }
          if (updates.length > 0) {
            await updateTranslations(updates);
          }
          success += batchSuccess;
          skipped += batch.length - batchSuccess;
        } catch (err) {
          console.error("Regenerate batch failed:", err);
          batchFailed += batch.length;
          skipped += batch.length;
        }
        setRegenerateProgress((prev) => prev + batch.length);
      }

      if (batchFailed === total) {
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

    const allWords = Array.from(words.wordData.keys());
    if (allWords.length === 0) {
      normalizingRef.current = false;
      return;
    }

    setNormalizing(true);
    setNormalizeProgress(0);
    const total = allWords.length;
    const renames: Array<{ from: string; to: string }> = [];
    let batchFailed = 0;

    try {
      const batches: string[][] = [];
      for (let i = 0; i < total; i += MAX_NORMALIZE_BATCH_SIZE) {
        batches.push(allWords.slice(i, i + MAX_NORMALIZE_BATCH_SIZE));
      }

      for (const batch of batches) {
        try {
          const data = await postJson<{ results?: NormalizeResult[] }>(
            "/api/normalize-words",
            { words: batch },
            t("profile.normalizeFailed")
          );
          const lemmaByWord = new Map(
            (data.results ?? []).map((item) => [item.word, item.lemma])
          );
          renames.push(...resolveRenamePlan(batch, lemmaByWord));
        } catch (err) {
          console.error("Normalize batch failed:", err);
          batchFailed += batch.length;
        }
        setNormalizeProgress((prev) => prev + batch.length);
      }

      if (batchFailed === total) {
        toast({
          title: t("profile.normalizeFailed"),
          variant: "destructive",
        });
        return;
      }

      if (renames.length === 0) {
        toast({ title: t("profile.normalizeNone"), variant: "success" });
        return;
      }

      const { renamed, merged } = await normalizeWordForms(renames);
      toast({
        title: t("profile.normalizeSuccess", { renamed, merged }),
        variant: "success",
      });
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
