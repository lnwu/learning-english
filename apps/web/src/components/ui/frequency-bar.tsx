import * as React from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks";
import {
  getMasteryLevel,
  getMasteryLevelIndex,
  MASTERY_LEVEL_ORDER,
  type MasteryLevel,
} from "@/lib/masteryCalculator";

export const MASTERY_BAR_COLORS: Record<MasteryLevel, string> = {
  new: "bg-primary/20",
  learning: "bg-primary/35",
  familiar: "bg-primary/55",
  proficient: "bg-primary/75",
  mastered: "bg-primary",
};

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

    const levelLabels: Record<MasteryLevel, string> = {
      new: t('mastery.new'),
      learning: t('mastery.learning'),
      familiar: t('mastery.familiar'),
      proficient: t('mastery.proficient'),
      mastered: t('mastery.mastered'),
    };

    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2", className)}
        title={`${t('profile.mastery')}: ${levelLabels[level]} (${score}%)`}
      >
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((barLevel) => (
            <div
              key={barLevel}
              className={cn(
                "w-4 h-3 rounded-sm transition-all duration-300",
                barLevel <= levelIndex
                  ? MASTERY_BAR_COLORS[MASTERY_LEVEL_ORDER[barLevel]]
                  : "bg-muted"
              )}
            />
          ))}
        </div>
        {showLabel && (
          <span className="w-16 text-left text-xs whitespace-nowrap text-muted-foreground">
            {levelLabels[level]}
          </span>
        )}
      </div>
    );
  }
);

MasteryBar.displayName = "MasteryBar";

export { MasteryBar, getMasteryLevel, getMasteryLevelIndex };
