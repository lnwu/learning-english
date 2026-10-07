"use client";

import { Progress } from "@/components/ui";
import { useDailyGoal, useLocale } from "@/hooks";
import { getDailyPracticeProgress } from "@/lib/practiceTime";
import { cn } from "@/lib/utils";

interface DailyProgressProps {
  seconds: number | null;
  className?: string;
}

export const DailyProgress = ({ seconds, className }: DailyProgressProps) => {
  const { t } = useLocale();
  const { dailyGoalMinutes } = useDailyGoal();

  if (seconds === null) return null;

  const progress = getDailyPracticeProgress(seconds, dailyGoalMinutes * 60);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm text-muted-foreground">
        {progress >= 1 ? t("practice.dailyGoalReached") : t("practice.dailyProgressLabel")}
      </span>
      <Progress value={progress * 100} aria-label={t("practice.dailyProgressLabel")} />
    </div>
  );
};
