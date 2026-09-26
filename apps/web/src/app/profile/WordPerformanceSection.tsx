"use client";

import { memo, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  MasteryBar,
} from "@/components/ui";
import type { TranslationKey } from "@/lib/i18n";
import type { Words } from "@/lib/wordsStore";

const CATEGORY_META = [
  { category: 0, labelKey: "profile.shortWords" },
  { category: 1, labelKey: "profile.mediumWords" },
  { category: 2, labelKey: "profile.longWords" },
] as const;

type WordStat = Words["practiceStats"][number];

interface WordPerformanceRowProps {
  word: string;
  avgTime: number;
  count: number;
  masteryScore: number;
  reviews: number;
  hints: number;
  fluencyScore: number | null;
  onDelete: (word: string) => void;
  t: (key: TranslationKey) => string;
}

const WordPerformanceRow = memo(
  ({
    word,
    avgTime,
    count,
    masteryScore,
    reviews,
    hints,
    fluencyScore,
    onDelete,
    t,
  }: WordPerformanceRowProps) => (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <span className="font-medium">{word}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          ({reviews} {t("profile.reviews")} · {hints} {t("profile.hints")})
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right font-medium tabular-nums">
          {fluencyScore !== null
            ? `${fluencyScore}${t("profile.points")}`
            : count > 0
              ? `${avgTime.toFixed(1)}${t("profile.seconds")}`
              : "-"}
        </div>
        <MasteryBar score={masteryScore} showLabel={false} />
        <div className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {masteryScore}%
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t("profile.speedByLength")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("profile.speedByLengthDesc")}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            type="text"
            placeholder={t("profile.searchWord")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64"
          />

          <div className="flex flex-col gap-4">
            {CATEGORY_META.map(({ category, labelKey }) => {
              const baseline =
                words.inputTimeBaselineByLengthCategory[category];
              const categoryWords = filteredWordsByCategory[category];

              return (
                <div key={category} className="overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between gap-4 border-b bg-surface px-4 py-3">
                    <div className="text-sm font-medium">{t(labelKey)}</div>
                    <div className="text-base font-semibold tabular-nums">
                      {baseline !== null
                        ? `${baseline.toFixed(2)}${t("profile.seconds")}`
                        : t("profile.baselineInsufficient")}
                    </div>
                  </div>

                  {categoryWords.length > 0 && (
                    <div className="max-h-48 divide-y overflow-y-auto">
                      {categoryWords.map(
                        ({
                          word,
                          avgTime: wordAvgTime,
                          count,
                          masteryScore,
                          reviews,
                          hints,
                          fluencyScore,
                        }) => (
                          <WordPerformanceRow
                            key={word}
                            word={word}
                            avgTime={wordAvgTime}
                            count={count}
                            masteryScore={masteryScore}
                            reviews={reviews}
                            hints={hints}
                            fluencyScore={fluencyScore}
                            onDelete={onDelete}
                            t={t}
                          />
                        )
                      )}
                    </div>
                  )}

                  {categoryWords.length === 0 && (
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      {t("profile.noData")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }
);
