"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useLocale } from "@/hooks";
import {
  buildPracticeTimeWeeks,
  formatPracticeDuration,
  getPracticeTimeMonthLabels,
  type PracticeTimeLevel,
  PRACTICE_TIME_HEATMAP_WEEKS,
} from "@/lib/practiceTime";

const PRACTICE_TIME_LEVEL_CLASSES: Record<PracticeTimeLevel, string> = {
  0: "bg-gray-100 dark:bg-gray-700",
  1: "bg-green-200 dark:bg-green-900",
  2: "bg-green-400 dark:bg-green-700",
  3: "bg-green-600 dark:bg-green-500",
  4: "bg-green-800 dark:bg-green-300",
};

const HEATMAP_CELL_PITCH_PX = 15;
const HEATMAP_WEEKDAY_COLUMN_PX = 28;
const MIN_HEATMAP_WEEKS = 4;
const PRACTICE_TIME_LEVELS = [0, 1, 2, 3, 4] as PracticeTimeLevel[];

const PracticeHeatmap = memo(({ practiceTime }: { practiceTime: Map<string, number> }) => {
  const { locale, t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [weekCount, setWeekCount] = useState(PRACTICE_TIME_HEATMAP_WEEKS);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const weeks = Math.floor(
        (width - HEATMAP_WEEKDAY_COLUMN_PX) / HEATMAP_CELL_PITCH_PX
      );
      setWeekCount(
        Math.min(PRACTICE_TIME_HEATMAP_WEEKS, Math.max(MIN_HEATMAP_WEEKS, weeks))
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const weeks = buildPracticeTimeWeeks(practiceTime, new Date(), weekCount);
  const monthLabels = getPracticeTimeMonthLabels(weeks);
  const formatMonthLabel = (month: number) =>
    locale === "zh"
      ? `${month}月`
      : new Date(2000, month - 1, 1).toLocaleString("en", { month: "short" });

  return (
    <div ref={containerRef}>
      <div className="inline-block">
        <div
          className="relative h-4 mb-1"
          style={{ marginLeft: HEATMAP_WEEKDAY_COLUMN_PX }}
        >
          {monthLabels.map(({ weekIndex, month }) => (
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
            <span className="h-3">{t("profile.weekdayMon")}</span>
            <span className="h-3" />
            <span className="h-3">{t("profile.weekdayWed")}</span>
            <span className="h-3" />
            <span className="h-3">{t("profile.weekdayFri")}</span>
            <span className="h-3" />
          </div>
          <div className="grid grid-rows-7 grid-flow-col gap-[3px]">
            {weeks.flatMap((week, weekIndex) =>
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
          <span>{t("profile.practiceTimeLess")}</span>
          {PRACTICE_TIME_LEVELS.map((level) => (
            <span
              key={level}
              className={`w-3 h-3 rounded-sm ${PRACTICE_TIME_LEVEL_CLASSES[level]}`}
            />
          ))}
          <span>{t("profile.practiceTimeMore")}</span>
        </div>
      </div>
    </div>
  );
});

PracticeHeatmap.displayName = "PracticeHeatmap";

export default PracticeHeatmap;
