import { getMasteryLevel, type MasteryLevel } from "@/lib/masteryLevels";

export const averageMasteryScore = (stats: ReadonlyArray<{ masteryScore: number }>): number => {
  if (stats.length === 0) return 0;
  return Math.round(stats.reduce((sum, item) => sum + item.masteryScore, 0) / stats.length);
};

export const masteryDistribution = (
  stats: ReadonlyArray<{ masteryScore: number }>,
): Record<MasteryLevel, number> => {
  const counts: Record<MasteryLevel, number> = {
    new: 0,
    learning: 0,
    familiar: 0,
    proficient: 0,
    mastered: 0,
  };

  stats.forEach((item) => {
    counts[getMasteryLevel(item.masteryScore)] += 1;
  });

  return counts;
};
