"use client";

import { Button, ConfirmDialog, getMasteryLevel, MASTERY_BAR_COLORS } from "@/components/ui";
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
  const { words, deleteWord, resetPracticeRecords, updateTranslations, loading, error } =
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

  if (loading) {
    return (
      <main>
        <div className="text-center">{t('profile.loading')}</div>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <div className="text-center text-red-500">Error: {error}</div>
      </main>
    );
  }

  return (
    isClient && (
      <main className="container mx-auto p-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">{t('profile.title')}</h1>

        {/* User Info */}
        {user && (
          <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">{t('profile.accountInfo')}</h2>
            <div className="space-y-2">
              <p><strong>{t('profile.email')}:</strong> {user.email}</p>
              {user.displayName && <p><strong>{t('profile.name')}:</strong> {user.displayName}</p>}
            </div>
          </div>
        )}

        {/* Daily Practice Time */}
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{t('profile.practiceTimeTitle')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('profile.practiceTimeDesc')}
          </p>
          {practiceTime.size > 0 ? (
            <PracticeHeatmap practiceTime={practiceTime} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('profile.noData')}
            </p>
          )}
        </div>

        {/* Settings */}
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{t('profile.settings')}</h2>
          
          {/* Language Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">{t('profile.language')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleLanguageChange('zh')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  locale === 'zh'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                中文
              </button>
              <button
                onClick={() => handleLanguageChange('en')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  locale === 'en'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* AI Regenerate Definitions */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mb-6">
            <h3 className="text-lg font-semibold mb-2">{t('profile.regenerateTitle')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('profile.regenerateDesc')}
            </p>
            <Button
              variant="outline"
              onClick={() => setShowRegenerateDialog(true)}
              disabled={regenerating || totalWords === 0}
            >
              {regenerating
                ? `${t('common.loading')} ${regenerateProgress}/${totalWords}`
                : t('profile.regenerateButton')}
            </Button>
          </div>

          {/* Reset Practice Records */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">{t('profile.resetData')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('profile.resetDataDesc')}
            </p>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(true)}
              disabled={resetting}
              className="bg-red-50 hover:bg-red-100 text-red-600 border-red-300"
            >
              {resetting ? t('common.loading') : t('profile.resetButton')}
            </Button>
          </div>
        </div>

        {/* Statistics */}
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{t('profile.statistics')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">
                {totalWords}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{t('profile.totalWords')}</div>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900 rounded-lg">
              <div className="text-3xl font-bold text-green-600 dark:text-green-300">
                {overallAverageTime !== null ? `${overallAverageTime.toFixed(1)}${t('profile.seconds')}` : t('profile.noData')}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{t('profile.averageTime')}</div>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900 rounded-lg">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-300">
                {wordsWithStats.filter(w => w.count > 0).length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{t('profile.wordsPracticed')}</div>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900 rounded-lg">
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-300">
                {avgMasteryScore}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{t('profile.avgMastery')}</div>
            </div>
          </div>
        </div>

        {/* Mastery Distribution */}
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{t('profile.masteryDistribution')}</h2>
          {wordsWithStats.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.noPracticeData')}</p>
          ) : (
            <div className="space-y-3">
              {MASTERY_SEGMENTS.map(({ key, labelKey }) => {
                const count = masteryDistribution[key];
                const pct = totalWords > 0 ? Math.round((count / totalWords) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-16 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {t(labelKey)}
                    </span>
                    <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${MASTERY_BAR_COLORS[key]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-sm text-gray-600 dark:text-gray-400 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <WordPerformanceSection
          words={words}
          onDelete={handleDeleteRequest}
          t={t}
        />

        {/* No Data Message */}
        {wordsWithStats.length === 0 && (
          <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow text-center">
            <p className="text-gray-600 dark:text-gray-400">
              {t('profile.noPracticeData')}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex space-x-4">
          <Button render={<Link href="/words" />} nativeButton={false}>
            {t('profile.practiceWords')}
          </Button>
          <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
            {t('addWord.title')}
          </Button>
        </div>

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
      </main>
    )
  );
});

export default Profile;
