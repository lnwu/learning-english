"use client";

import { memo, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Input, MasteryBar } from "@/components/ui";
import type { TranslationKey } from "@/lib/i18n";
import type { Words } from "@/lib/wordsStore";

const COLOR_CLASSES = {
  blue: {
    header: "bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-700",
  },
  yellow: {
    header:
      "bg-yellow-50 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300",
    border: "border-yellow-200 dark:border-yellow-700",
  },
  red: {
    header: "bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300",
    border: "border-red-200 dark:border-red-700",
  },
} as const;

const CATEGORY_META = [
  { category: 0, labelKey: "profile.shortWords", color: "blue" },
  { category: 1, labelKey: "profile.mediumWords", color: "yellow" },
  { category: 2, labelKey: "profile.longWords", color: "red" },
] as const;

type WordStat = Words["practiceStats"][number];

interface WordPerformanceRowProps {
  word: string;
  avgTime: number;
  count: number;
  masteryScore: number;
  correctCount: number;
  totalAttempts: number;
  onDelete: (word: string) => void;
  t: (key: TranslationKey) => string;
}

const WordPerformanceRow = memo(
  ({
    word,
    avgTime,
    count,
    masteryScore,
    correctCount,
    totalAttempts,
    onDelete,
    t,
  }: WordPerformanceRowProps) => (
    <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex-1">
        <span className="font-medium">{word}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
          ({correctCount}/{totalAttempts} {t("profile.correct")})
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="font-semibold">
            {count > 0 ? `${avgTime.toFixed(1)}${t("profile.seconds")}` : "-"}
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
          onClick={() => onDelete(word)}
          aria-label={t("profile.deleteWord")}
        >
          {t("profile.deleteWord")}
        </Button>
      </div>
    </div>
  )
);

WordPerformanceRow.displayName = "WordPerformanceRow";

interface WordPerformanceSectionProps {
  words: Words;
  onDelete: (word: string) => void;
  t: (key: TranslationKey) => string;
}

export const WordPerformanceSection = observer(
  ({ words, onDelete, t }: WordPerformanceSectionProps) => {
    const [searchQuery, setSearchQuery] = useState("");
    const wordsWithStats = words.practiceStats;

    const wordsByCategory = useMemo<Record<number, WordStat[]>>(() => {
      const grouped: Record<number, WordStat[]> = {
        0: [],
        1: [],
        2: [],
      };
      wordsWithStats.forEach((item) => {
        grouped[words.getWordLengthCategory(item.word)].push(item);
      });
      return grouped;
    }, [wordsWithStats, words]);

    const filteredWordsByCategory = useMemo<Record<number, WordStat[]>>(() => {
      if (!searchQuery.trim()) {
        return wordsByCategory;
      }
      const query = searchQuery.toLowerCase().trim();
      const filtered: Record<number, WordStat[]> = {
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

    return (
      <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">
          {t("profile.speedByLength")}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t("profile.speedByLengthDesc")}
        </p>

        <div className="mb-4">
          <Input
            type="text"
            placeholder={t("profile.searchWord")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64"
          />
        </div>

        <div className="space-y-6">
          {CATEGORY_META.map(({ category, labelKey, color }) => {
            const avgTime = words.averageTimeByLengthCategory[category];
            const categoryWords = filteredWordsByCategory[category];
            const classes = COLOR_CLASSES[color];

            return (
              <div
                key={category}
                className={`border rounded-lg overflow-hidden ${classes.border}`}
              >
                <div
                  className={`p-4 ${classes.header} flex items-center justify-between`}
                >
                  <div className="font-semibold">{t(labelKey)}</div>
                  <div className="text-xl font-bold">
                    {avgTime !== null
                      ? `${avgTime.toFixed(2)}${t("profile.seconds")}`
                      : t("profile.noData")}
                  </div>
                </div>

                {categoryWords.length > 0 && (
                  <div className="max-h-48 overflow-y-auto">
                    {categoryWords.map(
                      ({
                        word,
                        avgTime: wordAvgTime,
                        count,
                        masteryScore,
                        correctCount,
                        totalAttempts,
                      }) => (
                        <WordPerformanceRow
                          key={word}
                          word={word}
                          avgTime={wordAvgTime}
                          count={count}
                          masteryScore={masteryScore}
                          correctCount={correctCount}
                          totalAttempts={totalAttempts}
                          onDelete={onDelete}
                          t={t}
                        />
                      )
                    )}
                  </div>
                )}

                {categoryWords.length === 0 && (
                  <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("profile.noData")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
