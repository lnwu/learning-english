import * as React from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks";
import { getMasteryLevel, getMasteryLevelIndex, type MasteryLevel } from "@/lib/masteryCalculator";

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
    
    // Define colors for each mastery level
    const levelColors = [
      "bg-red-500",      // Level 0: New (0-19)
      "bg-orange-500",   // Level 1: Learning (20-39)
      "bg-yellow-500",   // Level 2: Familiar (40-59)
      "bg-lime-500",     // Level 3: Proficient (60-79)
      "bg-green-500",    // Level 4: Mastered (80-100)
    ];

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
                  ? levelColors[barLevel]
                  : "bg-gray-300 dark:bg-gray-600"
              )}
            />
          ))}
        </div>
        {showLabel && (
          <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap w-16 text-left">
            {levelLabels[level]}
          </span>
        )}
      </div>
    );
  }
);

MasteryBar.displayName = "MasteryBar";

// Legacy support: FrequencyBar that converts old frequency to new score
interface FrequencyBarProps {
  frequency: number;
  className?: string;
}

const FrequencyBar = React.forwardRef<HTMLDivElement, FrequencyBarProps>(
  ({ frequency, className }, ref) => {
    // Convert old frequency (-5 to 10+) to new score (0-100)
    // Old system: -5 to 10, map to 0-100
    const score = Math.min(100, Math.max(0, (frequency + 5) * (100 / 15)));
    return <MasteryBar ref={ref} score={score} className={className} />;
  }
);

FrequencyBar.displayName = "FrequencyBar";

export { MasteryBar, FrequencyBar, getMasteryLevel, getMasteryLevelIndex };
