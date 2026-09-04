"use client";

import { Button, ConfirmDialog, Input, MasteryBar, getMasteryLevel } from "@/components/ui";
import { useFirestoreWords, useLocale, toast, useAuth } from "@/hooks";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { type Locale, type TranslationKey } from "@/lib/i18n";
import { auth, db, getEffectiveUserId } from "@/lib/firebase";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import {
  buildPracticeTimeWeeks,
  formatPracticeDuration,
  getPracticeTimeMonthLabels,
  type PracticeTimeLevel,
  PRACTICE_TIME_HEATMAP_WEEKS,
} from "@/lib/practiceTime";
import { formatSenses } from "@/lib/parseTranslation";
import type { MasteryLevel } from "@/lib/masteryCalculator";
import {
  MAX_REGENERATE_BATCH_SIZE,
  type RegenerateResult,
} from "@/lib/regenerateDefinitions";

const COLOR_CLASSES = {
  blue: {
    header: "bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-700",
  },
  yellow: {
    header: "bg-yellow-50 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300",
    border: "border-yellow-200 dark:border-yellow-700",
  },
  red: {
    header: "bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300",
    border: "border-red-200 dark:border-red-700",
  },
} as const;

const MASTERY_SEGMENTS: Array<{
  key: MasteryLevel;
  labelKey: TranslationKey;
  barColor: string;
}> = [
  { key: "new", labelKey: "mastery.new", barColor: "bg-red-500" },
  { key: "learning", labelKey: "mastery.learning", barColor: "bg-orange-500" },
  { key: "familiar", labelKey: "mastery.familiar", barColor: "bg-yellow-500" },
  { key: "proficient", labelKey: "mastery.proficient", barColor: "bg-lime-500" },
  { key: "mastered", labelKey: "mastery.mastered", barColor: "bg-green-500" },
];

const PRACTICE_TIME_LEVEL_CLASSES: Record<PracticeTimeLevel, string> = {
  0: "bg-gray-100 dark:bg-gray-700",
  1: "bg-green-200 dark:bg-green-900",
  2: "bg-green-400 dark:bg-green-700",
  3: "bg-green-600 dark:bg-green-500",
  4: "bg-green-800 dark:bg-green-300",
};

const HEATMAP_CELL_PITCH_PX = 15;
const HEATMAP_WEEKDAY_COLUMN_PX = 28;

const Profile = observer(() => {
  const { user } = useAuth();
  const { words, deleteWord, resetPracticeRecords, updateTranslations, loading, error } =
    useFirestoreWords();
  const [isClient, setIsClient] = useState(false);
  const { locale, setLocale, t } = useLocale();
  const [resetting, setResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  const wordsByCategory = useMemo<Record<number, typeof wordsWithStats>>(() => {
    const grouped: Record<number, typeof wordsWithStats> = {
      0: [], // short words
      1: [], // medium words
      2: [], // long words
    };
    wordsWithStats.forEach((item) => {
      grouped[words.getWordLengthCategory(item.word)].push(item);
    });
    return grouped;
  }, [wordsWithStats, words]);

  // Filter words by search query
  const filteredWordsByCategory = useMemo<Record<number, typeof wordsWithStats>>(() => {
    if (!searchQuery.trim()) {
      return wordsByCategory;
    }
    const query = searchQuery.toLowerCase().trim();
    const filtered: Record<number, typeof wordsWithStats> = {
      0: [],
      1: [],
      2: [],
    };
    Object.entries(wordsByCategory).forEach(([cat, categoryWords]) => {
      filtered[Number(cat)] = categoryWords.filter(({ word }) => 
        word.toLowerCase().includes(query)
      );
    });
    return filtered;
  }, [searchQuery, wordsByCategory]);

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

  const practiceTimeContainerRef = useRef<HTMLDivElement>(null);
  const [practiceTimeWeekCount, setPracticeTimeWeekCount] = useState(
    PRACTICE_TIME_HEATMAP_WEEKS
  );

  useEffect(() => {
    const container = practiceTimeContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const weeks = Math.floor(
        (width - HEATMAP_WEEKDAY_COLUMN_PX) / HEATMAP_CELL_PITCH_PX
      );
      setPracticeTimeWeekCount(
        Math.min(PRACTICE_TIME_HEATMAP_WEEKS, Math.max(4, weeks))
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [practiceTime.size]);

  const practiceTimeWeeks = useMemo(
    () => buildPracticeTimeWeeks(practiceTime, new Date(), practiceTimeWeekCount),
    [practiceTime, practiceTimeWeekCount]
  );
  const practiceTimeMonthLabels = useMemo(
    () => getPracticeTimeMonthLabels(practiceTimeWeeks),
    [practiceTimeWeeks]
  );
  const formatMonthLabel = (month: number) =>
    locale === 'zh'
      ? `${month}月`
      : new Date(2000, month - 1, 1).toLocaleString('en', { month: 'short' });

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
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error(t('error.notAuthenticated'));
      }

      for (let i = 0; i < total; i += MAX_REGENERATE_BATCH_SIZE) {
        batches.push(allWords.slice(i, i + MAX_REGENERATE_BATCH_SIZE));
      }

      for (const batch of batches) {
        let batchSuccess = 0;
        try {
          const response = await fetch("/api/regenerate-definitions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ words: batch }),
          });

          const data = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              data && typeof data.error === "string"
                ? data.error
                : t('profile.regenerateFailed')
            );
          }

          const results = (data as { results?: RegenerateResult[] } | null)?.results ?? [];
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
          title: t('profile.regeneratePartial').replace('{success}', String(success)).replace('{skipped}', String(skipped)),
          variant: "success",
        });
      } else {
        toast({
          title: t('profile.regenerateSuccess').replace('{success}', String(success)),
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
            <div ref={practiceTimeContainerRef}>
              <div className="inline-block">
                <div
                  className="relative h-4 mb-1"
                  style={{ marginLeft: HEATMAP_WEEKDAY_COLUMN_PX }}
                >
                  {practiceTimeMonthLabels.map(({ weekIndex, month }) => (
                    <span
                      key={weekIndex}
                      className="absolute text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
                      style={{ left: weekIndex * HEATMAP_CELL_PITCH_PX }}
                    >
                      {formatMonthLabel(month)}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <div
                    className="grid grid-rows-7 gap-[3px] text-[10px] leading-3 text-gray-500 dark:text-gray-400"
                    style={{ width: HEATMAP_WEEKDAY_COLUMN_PX - 4 }}
                  >
                    <span className="h-3" />
                    <span className="h-3">{t('profile.weekdayMon')}</span>
                    <span className="h-3" />
                    <span className="h-3">{t('profile.weekdayWed')}</span>
                    <span className="h-3" />
                    <span className="h-3">{t('profile.weekdayFri')}</span>
                    <span className="h-3" />
                  </div>
                  <div className="grid grid-rows-7 grid-flow-col gap-[3px]">
                    {practiceTimeWeeks.flatMap((week, weekIndex) =>
                      week.map((cell, dayIndex) =>
                        cell ? (
                          <div
                            key={cell.date}
                            aria-label={`${cell.date} · ${formatPracticeDuration(cell.seconds, locale)}`}
                            className={`relative group w-3 h-3 rounded-sm ${PRACTICE_TIME_LEVEL_CLASSES[cell.level]}`}
                          >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                              {cell.date} · {formatPracticeDuration(cell.seconds, locale)}
                            </div>
                          </div>
                        ) : (
                          <div key={`${weekIndex}-${dayIndex}`} className="w-3 h-3" />
                        )
                      )
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{t('profile.practiceTimeLess')}</span>
                  {(Object.keys(PRACTICE_TIME_LEVEL_CLASSES) as unknown as PracticeTimeLevel[]).map((level) => (
                    <span
                      key={level}
                      className={`w-3 h-3 rounded-sm ${PRACTICE_TIME_LEVEL_CLASSES[level]}`}
                    />
                  ))}
                  <span>{t('profile.practiceTimeMore')}</span>
                </div>
              </div>
            </div>
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
              {MASTERY_SEGMENTS.map(({ key, labelKey, barColor }) => {
                const count = masteryDistribution[key];
                const pct = totalWords > 0 ? Math.round((count / totalWords) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-16 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {t(labelKey)}
                    </span>
                    <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all`}
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

        {/* Average Speed by Word Length with Word Performance */}
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">{t('profile.speedByLength')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('profile.speedByLengthDesc')}
          </p>
          
          {/* Search Input */}
          <div className="mb-4">
            <Input
              type="text"
              placeholder={t('profile.searchWord')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-64"
            />
          </div>
          
          <div className="space-y-6">
            {([
              { category: 0, labelKey: "profile.shortWords", color: "blue" },
              { category: 1, labelKey: "profile.mediumWords", color: "yellow" },
              { category: 2, labelKey: "profile.longWords", color: "red" },
            ] as const).map(({ category, labelKey, color }) => {
              const avgTime = words.averageTimeByLengthCategory[category];
              const categoryWords = filteredWordsByCategory[category];
              const classes = COLOR_CLASSES[color as keyof typeof COLOR_CLASSES];
              
              return (
                <div key={category} className={`border rounded-lg overflow-hidden ${classes.border}`}>
                  {/* Category Header */}
                  <div className={`p-4 ${classes.header} flex items-center justify-between`}>
                    <div className="font-semibold">{t(labelKey)}</div>
                    <div className="text-xl font-bold">
                      {avgTime !== null ? `${avgTime.toFixed(2)}${t('profile.seconds')}` : t('profile.noData')}
                    </div>
                  </div>
                  
                  {/* Words in this category */}
                  {categoryWords.length > 0 && (
                    <div className="max-h-48 overflow-y-auto">
                      {categoryWords.map(({ word, avgTime: wordAvgTime, count, masteryScore, correctCount, totalAttempts }) => (
                        <div
                          key={word}
                          className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
                        >
                          <div className="flex-1">
                            <span className="font-medium">{word}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                              ({correctCount}/{totalAttempts} {t('profile.correct')})
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="font-semibold">
                                {count > 0 ? `${wordAvgTime.toFixed(1)}${t('profile.seconds')}` : '-'}
                              </div>
                            </div>
                            <MasteryBar score={masteryScore} showLabel={false} />
                            <div className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                              {masteryScore}%
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2"
                              onClick={() => setWordToDelete(word)}
                              aria-label={t('profile.deleteWord')}
                            >
                              {t('profile.deleteWord')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {categoryWords.length === 0 && (
                    <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                      {t('profile.noData')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

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
          title={t('profile.deleteConfirm').replace('{word}', wordToDelete ?? '')}
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
