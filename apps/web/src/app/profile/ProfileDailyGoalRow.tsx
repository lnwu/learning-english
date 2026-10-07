"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui";
import { useDailyGoal, useLocale, toast } from "@/hooks";
import { DAILY_GOAL_PRESET_MINUTES } from "@/lib/dailyGoal";
import { formatPracticeDuration } from "@/lib/practiceTime";
import { SettingRow } from "./SettingRow";

export const ProfileDailyGoalRow = () => {
  const { dailyGoalMinutes, setDailyGoalMinutes } = useDailyGoal();
  const { locale, t } = useLocale();

  const handleChange = (value: string) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return;
    setDailyGoalMinutes(minutes).catch((error) => {
      console.error("Failed to save daily goal preference:", error);
      toast({ title: t("profile.dailyGoalSaveFailed"), variant: "destructive" });
    });
  };

  return (
    <SettingRow title={t("profile.dailyGoal")} description={t("profile.dailyGoalDesc")}>
      <ToggleGroup
        value={[String(dailyGoalMinutes)]}
        onValueChange={(value) => {
          const next = value[0];
          if (next !== undefined) handleChange(next);
        }}
        variant="outline"
        size="sm"
      >
        {DAILY_GOAL_PRESET_MINUTES.map((minutes) => (
          <ToggleGroupItem key={minutes} value={String(minutes)}>
            {formatPracticeDuration(minutes * 60, locale)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SettingRow>
  );
};
