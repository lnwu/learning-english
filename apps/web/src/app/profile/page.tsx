"use client";

import { Button, ConfirmDialog, Input, MasteryBar } from "@/components/ui";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { type Locale } from "@/lib/i18n";

const Profile = observer(() => {
  const { data: session } = useSession();
  const { words, resetPracticeRecords, loading, error } = useFirestoreWords();
  const [isClient, setIsClient] = useState(false);
  const { locale, setLocale, t } = useLocale();
  const [resetting, setResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Group words by length category
  const getWordLengthCategory = (word: string): number => {
    if (word.length <= 5) return 0; // short
    if (word.length <= 10) return 1; // medium
    return 2; // long
  };

  // Calculate statistics directly (MobX will track dependencies)
  const totalWords = words.allWords.size;
  const overallAverageTime = words.getOverallAverageInputTime();
  
  const wordsWithStats: Array<{ 
    word: string; 
    avgTime: number; 
    count: number;
    masteryScore: number;
    correctCount: number;
    totalAttempts: number;
  }> = [];
  
  words.allWords.forEach((translation, word) => {
    const times = words.getInputTimes(word);
    const masteryScore = words.getMasteryScore(word);
    const avg = times.length > 0 
      ? times.reduce((sum, t) => sum + t, 0) / times.length 
      : 0;
    wordsWithStats.push({ 
      word, 
      avgTime: avg, 
      count: times.length,
      masteryScore,
      correctCount: words.getCorrectCount(word),
      totalAttempts: words.getTotalAttempts(word),
    });
  });

  // Sort by mastery score (lowest first - needs most practice)
  wordsWithStats.sort((a, b) => a.masteryScore - b.masteryScore);

  const wordsByCategory: Record<number, typeof wordsWithStats> = {
    0: [], // short words
    1: [], // medium words
    2: [], // long words
  };

  wordsWithStats.forEach((item) => {
    const category = getWordLengthCategory(item.word);
    wordsByCategory[category].push(item);
  });

  // Filter words by search query
  const getFilteredWordsByCategory = () => {
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
  };

  const filteredWordsByCategory = getFilteredWordsByCategory();

  // Calculate average mastery score
  const avgMasteryScore = wordsWithStats.length > 0
    ? Math.round(wordsWithStats.reduce((sum, w) => sum + w.masteryScore, 0) / wordsWithStats.length)
    : 0;

  const handleResetRecords = async () => {
    setResetting(true);
    try {
      await resetPracticeRecords();
      toast({
        title: t('profile.resetSuccess'),
        variant: "success",
      });
      setTimeout(() => window.location.reload(), 1000);
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
        {session?.user && (
          <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">{t('profile.accountInfo')}</h2>
            <div className="space-y-2">
              <p><strong>{t('profile.email')}:</strong> {session.user.email}</p>
              {session.user.name && <p><strong>{t('profile.name')}:</strong> {session.user.name}</p>}
            </div>
          </div>
        )}

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
            {[
              { category: 0, labelKey: "profile.shortWords", color: "blue" },
              { category: 1, labelKey: "profile.mediumWords", color: "yellow" },
              { category: 2, labelKey: "profile.longWords", color: "red" }
            ].map(({ category, labelKey, color }) => {
              const avgTime = words.getAverageTimeByLengthCategory(category);
              const categoryWords = filteredWordsByCategory[category];
              const colorClasses = {
                blue: {
                  header: "bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300",
                  border: "border-blue-200 dark:border-blue-700"
                },
                yellow: {
                  header: "bg-yellow-50 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300",
                  border: "border-yellow-200 dark:border-yellow-700"
                },
                red: {
                  header: "bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300",
                  border: "border-red-200 dark:border-red-700"
                }
              };
              const classes = colorClasses[color as keyof typeof colorClasses];
              
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
          <Link href="/home">
            <Button>{t('profile.practiceWords')}</Button>
          </Link>
          <Link href="/add-word">
            <Button variant="outline">{t('addWord.title')}</Button>
          </Link>
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
      </main>
    )
  );
});

export default Profile;
