import type { Locale } from "./i18n";
import { formatLocalPracticeDate } from "./practiceDate";

export class ActiveTimeTracker {
  private active = false;
  private activeSince: number | null = null;
  private pendingMs = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    if (active) {
      this.activeSince = this.now();
    } else if (this.activeSince !== null) {
      this.pendingMs += this.now() - this.activeSince;
      this.activeSince = null;
    }
  }

  takePendingMs(): number {
    let total = this.pendingMs;
    if (this.active && this.activeSince !== null) {
      total += this.now() - this.activeSince;
      this.activeSince = this.now();
    }
    this.pendingMs = 0;
    return total;
  }
}

export type PracticeTimeLevel = 0 | 1 | 2 | 3 | 4;

export const getPracticeTimeLevel = (seconds: number): PracticeTimeLevel => {
  if (seconds <= 0) return 0;
  if (seconds < 15 * 60) return 1;
  if (seconds < 30 * 60) return 2;
  if (seconds < 60 * 60) return 3;
  return 4;
};

export interface PracticeTimeDayCell {
  date: string;
  seconds: number;
  level: PracticeTimeLevel;
}

export const PRACTICE_TIME_HEATMAP_WEEKS = 53;

export const buildPracticeTimeWeeks = (
  secondsByDate: ReadonlyMap<string, number>,
  endDate: Date,
  weekCount: number = PRACTICE_TIME_HEATMAP_WEEKS
): Array<Array<PracticeTimeDayCell | null>> => {
  const end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  const start = new Date(end);
  start.setDate(start.getDate() - (weekCount - 1) * 7 - end.getDay());

  const weeks: Array<Array<PracticeTimeDayCell | null>> = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: Array<PracticeTimeDayCell | null> = [];
    for (let day = 0; day < 7; day++) {
      if (cursor <= end) {
        const date = formatLocalPracticeDate(cursor);
        const seconds = secondsByDate.get(date) ?? 0;
        week.push({ date, seconds, level: getPracticeTimeLevel(seconds) });
      } else {
        week.push(null);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
};

export const getPracticeTimeMonthLabels = (
  weeks: Array<Array<PracticeTimeDayCell | null>>
): Array<{ weekIndex: number; month: number }> => {
  const labels: Array<{ weekIndex: number; month: number }> = [];
  weeks.forEach((week, weekIndex) => {
    const first = week.find((cell) => cell !== null);
    if (!first) return;
    const dayOfMonth = Number(first.date.slice(8, 10));
    if (dayOfMonth <= 7) {
      labels.push({ weekIndex, month: Number(first.date.slice(5, 7)) });
    }
  });
  return labels;
};

export const formatPracticeDuration = (
  totalSeconds: number,
  locale: Locale
): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (locale === "zh") {
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    if (totalMinutes > 0) return `${totalMinutes}分钟`;
    return `${seconds}秒`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${seconds}s`;
};
