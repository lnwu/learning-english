"use client";

import { ProgressRing } from "@/components/ui";
import { useDailyGoal, useLocale } from "@/hooks";
import { getDailyPracticeProgress } from "@/lib/practiceTime";

interface DailyProgressProps {
  seconds: number | null;
}

export const DailyProgress = ({ seconds }: DailyProgressProps) => {
  const { t } = useLocale();
  const { dailyGoalMinutes } = useDailyGoal();

  if (seconds === null) return null;

  const progress = getDailyPracticeProgress(seconds, dailyGoalMinutes * 60);
  const label = progress >= 1 ? t("practice.dailyGoalReached") : t("practice.dailyProgressLabel");

  return <ProgressRing value={progress * 100} aria-label={label} title={label} />;
};
