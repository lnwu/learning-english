"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LoadingState,
  MASTERY_BAR_COLORS,
  PageContainer,
  PageHeader,
  StatTile,
  ToggleGroup,
  ToggleGroupItem,
  getMasteryLevel,
} from "@/components/ui";
import { useFirestoreWords, useLocale, toast, useAuth } from "@/hooks";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { type Locale, type TranslationKey } from "@/lib/i18n";
import { db, getEffectiveUserId } from "@/lib/firebase";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { postJson } from "@/lib/apiClient";
import PracticeHeatmap from "./PracticeHeatmap";
import { WordPerformanceSection } from "./WordPerformanceSection";
import { formatSenses } from "@/lib/parseTranslation";
import type { MasteryLevel } from "@/lib/masteryCalculator";
import {
  MAX_REGENERATE_BATCH_SIZE,
  type RegenerateResult,
} from "@/lib/regenerateDefinitions";
import {
  MAX_NORMALIZE_BATCH_SIZE,
  type NormalizeResult,
} from "@/lib/normalizeWords";
import { resolveRenamePlan } from "@/lib/wordNormalization";

const MASTERY_SEGMENTS: Array<{
  key: MasteryLevel;
  labelKey: TranslationKey;
}> = [
  { key: "new", labelKey: "mastery.new" },
  { key: "learning", labelKey: "mastery.learning" },
  { key: "familiar", labelKey: "mastery.familiar" },
  { key: "proficient", labelKey: "mastery.proficient" },
  { key: "mastered", labelKey: "mastery.mastered" },
];

const Profile = observer(() => {
  const { user } = useAuth();
  const { words, deleteWord, resetPracticeRecords, updateTranslations, normalizeWordForms, loading, error } =
    useFirestoreWords();
  const [isClient, setIsClient] = useState(false);
  const { locale, setLocale, t } = useLocale();
  const [resetting, setResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [wordToDelete, setWordToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState(0);
  const regeneratingRef = useRef(false);
  const [showNormalizeDialog, setShowNormalizeDialog] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeProgress, setNormalizeProgress] = useState(0);
  const normalizingRef = useRef(false);
  const [practiceTime, setPracticeTime] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    if (!user) return;
    const userId = getEffectiveUserId(user);
    getDocs(collection(db, "users", userId, "practiceTime"))
      .then((snapshot) => {
        setPracticeTime(
          new Map(
            snapshot.docs.map((doc) => [
              doc.id,
              Number(doc.data().seconds) || 0,
            ])
          )
        );
      })
      .catch((err) => {
        console.error("Failed to load practice time:", err);
      });
  }, [user]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const totalWords = words.wordData.size;
  const overallAverageTime = words.overallAverageInputTime;

  const wordsWithStats = words.practiceStats;

  // Calculate average mastery score
  const avgMasteryScore = wordsWithStats.length > 0
    ? Math.round(wordsWithStats.reduce((sum, w) => sum + w.masteryScore, 0) / wordsWithStats.length)
    : 0;

  const masteryDistribution = useMemo(() => {
    const counts: Record<MasteryLevel, number> = {
      new: 0,
      learning: 0,
      familiar: 0,
      proficient: 0,
      mastered: 0,
    };
    wordsWithStats.forEach((item) => {
      counts[getMasteryLevel(item.masteryScore)] += 1;
    });
    return counts;
  }, [wordsWithStats]);

  const handleResetRecords = async () => {
    setResetting(true);
    try {
      await resetPracticeRecords();
      toast({
        title: t('profile.resetSuccess'),
        variant: "success",
      });
      setResetting(false);
    } catch (err) {
      console.error("Reset failed:", err);
      toast({
        title: t('profile.resetError'),
        variant: "destructive",
      });
      setResetting(false);
    }
  };

  const handleLanguageChange = (newLocale: Locale) => {
    setLocale(newLocale);
  };

  const handleDeleteWord = async () => {
    if (!wordToDelete) return;
    setDeleting(true);
    try {
      await deleteWord(wordToDelete);
      toast({
        title: t('profile.deleteSuccess'),
        variant: "success",
      });
    } catch (err) {
      console.error("Delete word failed:", err);
      toast({
        title: t('profile.deleteError'),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setWordToDelete(null);
    }
  };

  const handleDeleteRequest = useCallback((word: string) => {
    setWordToDelete(word);
  }, []);

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
          title: t('profile.regenerateFailed'),
          variant: "destructive",
        });
      } else if (skipped > 0) {
        toast({
          title: t('profile.regeneratePartial', { success, skipped }),
          variant: "success",
        });
      } else {
        toast({
          title: t('profile.regenerateSuccess', { success }),
          variant: "success",
        });
      }
    } catch (err) {
      console.error("Regenerate all failed:", err);
      toast({
        title:
          err instanceof Error ? err.message : t('profile.regenerateFailed'),
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

  if (loading) {
    return (
      <PageContainer width="wide">
        <LoadingState label={t('profile.loading')} />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer width="wide">
        <Alert variant="destructive">
          <AlertTitle>{t('common.error')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    isClient && (
      <PageContainer width="wide">
        <PageHeader
          className="mb-6"
          title={t('profile.title')}
          actions={
            <>
              <Button render={<Link href="/words" />} nativeButton={false}>
                {t('profile.practiceWords')}
              </Button>
              <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
                {t('addWord.title')}
              </Button>
            </>
          }
        />

        {user && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t('profile.accountInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">{t('profile.email')}:</span> {user.email}
              </p>
              {user.displayName && (
                <p>
                  <span className="text-muted-foreground">{t('profile.name')}:</span> {user.displayName}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('profile.practiceTimeTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('profile.practiceTimeDesc')}</p>
          </CardHeader>
          <CardContent>
            {practiceTime.size > 0 ? (
              <PracticeHeatmap practiceTime={practiceTime} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('profile.noData')}</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('profile.settings')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            <div className="flex flex-col gap-2 py-6 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label className="text-sm font-medium">{t('profile.language')}</label>
              <ToggleGroup
                value={[locale]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === 'zh' || next === 'en') {
                    handleLanguageChange(next);
                  }
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="zh">中文</ToggleGroupItem>
                <ToggleGroupItem value="en">English</ToggleGroupItem>
              </ToggleGroup>
            </div>

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

            <div className="flex flex-col gap-2 py-6 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-destructive">{t('profile.resetData')}</h3>
                <p className="text-sm text-muted-foreground">{t('profile.resetDataDesc')}</p>
              </div>
              <Button
                variant="destructive"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => setShowResetDialog(true)}
                disabled={resetting}
              >
                {resetting ? t('common.loading') : t('profile.resetButton')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile value={totalWords} label={t('profile.totalWords')} />
          <StatTile
            value={overallAverageTime !== null ? `${overallAverageTime.toFixed(1)}${t('profile.seconds')}` : t('profile.noData')}
            label={t('profile.averageTime')}
          />
          <StatTile
            value={wordsWithStats.filter(w => w.count > 0).length}
            label={t('profile.wordsPracticed')}
          />
          <StatTile value={`${avgMasteryScore}%`} label={t('profile.avgMastery')} />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('profile.masteryDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            {wordsWithStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('profile.noPracticeData')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {MASTERY_SEGMENTS.map(({ key, labelKey }) => {
                  const count = masteryDistribution[key];
                  const pct = totalWords > 0 ? Math.round((count / totalWords) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-16 text-sm whitespace-nowrap text-muted-foreground">
                        {t(labelKey)}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted inset-shadow-2xs">
                        <div
                          className={`h-full rounded-full ${MASTERY_BAR_COLORS[key]} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <WordPerformanceSection
          words={words}
          onDelete={handleDeleteRequest}
          t={t}
        />

        {wordsWithStats.length === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{t('profile.noPracticeData')}</EmptyTitle>
              <EmptyDescription>{t('profile.practiceTimeDesc')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {/* Reset Confirmation Dialog */}
        <ConfirmDialog
          open={showResetDialog}
          onOpenChange={setShowResetDialog}
          title={t('profile.resetConfirm')}
          description={t('profile.resetConfirmDesc')}
          confirmText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={handleResetRecords}
          variant="destructive"
        />

        {/* Regenerate Definitions Confirmation Dialog */}
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

        {/* Normalize Word Forms Confirmation Dialog */}
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

        {/* Delete Word Confirmation Dialog */}
        <ConfirmDialog
          open={wordToDelete !== null}
          onOpenChange={(open) => {
            if (!open) setWordToDelete(null);
          }}
          title={t('profile.deleteConfirm', { word: wordToDelete ?? '' })}
          description={t('profile.deleteConfirmDesc')}
          confirmText={deleting ? t('common.loading') : t('common.confirm')}
          cancelText={t('common.cancel')}
          onConfirm={handleDeleteWord}
          variant="destructive"
        />
      </PageContainer>
    )
  );
});

export default Profile;
