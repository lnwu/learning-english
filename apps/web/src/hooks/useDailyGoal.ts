"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveUserId } from "@/lib/firebase";
import { DEFAULT_DAILY_GOAL_MINUTES } from "@/lib/dailyGoal";
import {
  getDailyGoalMinutes,
  loadDailyGoalPreference,
  resetDailyGoalPreference,
  saveDailyGoalPreference,
  subscribeDailyGoal,
} from "@/lib/dailyGoalPreference";

export const useDailyGoal = () => {
  const { user } = useAuth();
  const dailyGoalMinutes = useSyncExternalStore(
    subscribeDailyGoal,
    getDailyGoalMinutes,
    () => DEFAULT_DAILY_GOAL_MINUTES,
  );

  useEffect(() => {
    if (user) {
      void loadDailyGoalPreference(getEffectiveUserId(user));
    } else {
      resetDailyGoalPreference();
    }
  }, [user]);

  const setDailyGoalMinutes = useCallback(
    async (minutes: number) => {
      if (!user) return;
      await saveDailyGoalPreference(getEffectiveUserId(user), minutes);
    },
    [user],
  );

  return { dailyGoalMinutes, setDailyGoalMinutes };
};
