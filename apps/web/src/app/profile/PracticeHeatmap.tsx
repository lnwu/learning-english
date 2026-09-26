"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/hooks";
import { cn } from "@/lib/utils";
import {
  buildPracticeTimeWeeks,
  formatPracticeDuration,
  formatPracticeMonthLabel,
  getPracticeTimeMonthLabels,
  type PracticeTimeLevel,
  PRACTICE_TIME_HEATMAP_WEEKS,
} from "@/lib/practiceTime";

const PRACTICE_TIME_LEVEL_CLASSES: Record<PracticeTimeLevel, string> = {
  0: "bg-muted",
  1: "bg-heatmap-1",
  2: "bg-heatmap-2",
  3: "bg-heatmap-3",
  4: "bg-heatmap-4",
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
      const weeks = Math.floor((width - HEATMAP_WEEKDAY_COLUMN_PX) / HEATMAP_CELL_PITCH_PX);
      setWeekCount(Math.min(PRACTICE_TIME_HEATMAP_WEEKS, Math.max(MIN_HEATMAP_WEEKS, weeks)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const weeks = useMemo(
    () => buildPracticeTimeWeeks(practiceTime, new Date(), weekCount),
    [practiceTime, weekCount],
  );
  const monthLabels = useMemo(() => getPracticeTimeMonthLabels(weeks), [weeks]);

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="grid gap-[3px] text-xs text-muted-foreground"
        style={{
          gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`,
          marginLeft: HEATMAP_WEEKDAY_COLUMN_PX,
        }}
      >
        {monthLabels.map(({ weekIndex, month }) => (
          <span
            key={weekIndex}
            className="whitespace-nowrap"
            style={{ gridColumnStart: weekIndex + 1 }}
          >
            {formatPracticeMonthLabel(month, locale)}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        <div
          className="grid grid-rows-7 gap-[3px] text-[10px] leading-3 text-muted-foreground"
          style={{ width: HEATMAP_WEEKDAY_COLUMN_PX - 4 }}
        >
          <span />
          <span className="flex items-center">{t("profile.weekdayMon")}</span>
          <span />
          <span className="flex items-center">{t("profile.weekdayWed")}</span>
          <span />
          <span className="flex items-center">{t("profile.weekdayFri")}</span>
          <span />
        </div>
        <div
          className="grid flex-1 grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridAutoColumns: "minmax(0, 1fr)" }}
        >
          {weeks.flatMap((week, weekIndex) =>
            week.map((cell, dayIndex) =>
              cell ? (
                <div
                  key={cell.date}
                  aria-label={`${cell.date} · ${formatPracticeDuration(cell.seconds, locale)}`}
                  className={cn(
                    "group relative aspect-square w-full rounded-sm",
                    PRACTICE_TIME_LEVEL_CLASSES[cell.level],
                  )}
                >
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
                    {cell.date} · {formatPracticeDuration(cell.seconds, locale)}
                  </div>
                </div>
              ) : (
                <div key={`${weekIndex}-${dayIndex}`} className="aspect-square w-full" />
              ),
            ),
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span>{t("profile.practiceTimeLess")}</span>
        {PRACTICE_TIME_LEVELS.map((level) => (
          <span
            key={level}
            className={cn("size-3 rounded-sm", PRACTICE_TIME_LEVEL_CLASSES[level])}
          />
        ))}
        <span>{t("profile.practiceTimeMore")}</span>
      </div>
    </div>
  );
});

PracticeHeatmap.displayName = "PracticeHeatmap";

export default PracticeHeatmap;
