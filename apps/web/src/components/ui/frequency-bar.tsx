import * as React from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks";
import {
  getMasteryLevel,
  getMasteryLevelIndex,
  MASTERY_LEVELS,
  MASTERY_LEVEL_ORDER,
  type MasteryLevel,
} from "@/lib/masteryLevels";
import type { TranslationKey } from "@/lib/i18n";

export const MASTERY_BAR_COLORS: Record<MasteryLevel, string> = {
  new: "bg-rose-500",
  learning: "bg-orange-500",
  familiar: "bg-amber-400",
  proficient: "bg-lime-500",
  mastered: "bg-emerald-500",
};

const MASTERY_LABEL_KEYS: Record<MasteryLevel, TranslationKey> = Object.fromEntries(
  MASTERY_LEVELS.map((level) => [level.key, level.labelKey]),
) as Record<MasteryLevel, TranslationKey>;

interface MasteryBarProps {
  /** Mastery score from 0-100 */
  score: number;
  className?: string;
  /** Show the mastery label text */
  showLabel?: boolean;
}

const MasteryBar = React.forwardRef<HTMLDivElement, MasteryBarProps>(
  ({ score, className, showLabel = true }, ref) => {
    const { t } = useLocale();
    const level = getMasteryLevel(score);
    const levelIndex = getMasteryLevelIndex(score);

    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2", className)}
        title={`${t("profile.mastery")}: ${t(MASTERY_LABEL_KEYS[level])} (${score}%)`}
      >
        <div className="flex gap-1">
          {MASTERY_LEVEL_ORDER.map((barLevel, barIndex) => (
            <div
              key={barLevel}
              className={cn(
                "w-4 h-3 rounded-sm transition-all duration-300",
                barIndex <= levelIndex ? MASTERY_BAR_COLORS[barLevel] : "bg-muted",
              )}
            />
          ))}
        </div>
        {showLabel && (
          <span className="w-16 text-left text-xs whitespace-nowrap text-muted-foreground">
            {t(MASTERY_LABEL_KEYS[level])}
          </span>
        )}
      </div>
    );
  },
);

MasteryBar.displayName = "MasteryBar";

export { MasteryBar };
