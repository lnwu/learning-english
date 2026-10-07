export const DEFAULT_DAILY_GOAL_MINUTES = 30;
export const DAILY_GOAL_PRESET_MINUTES = [15, 30, 45, 60] as const;
export const MIN_DAILY_GOAL_MINUTES = 5;
export const MAX_DAILY_GOAL_MINUTES = 180;

export const normalizeDailyGoalMinutes = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_DAILY_GOAL_MINUTES;
  }
  return Math.min(Math.max(Math.round(value), MIN_DAILY_GOAL_MINUTES), MAX_DAILY_GOAL_MINUTES);
};
