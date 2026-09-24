import type { TranslationKey } from "@/lib/i18n";

export type MasteryLevel =
  | "new"
  | "learning"
  | "familiar"
  | "proficient"
  | "mastered";

export interface MasteryLevelDescriptor {
  key: MasteryLevel;
  min: number;
  labelKey: TranslationKey;
}

export const MASTERY_LEVELS: readonly MasteryLevelDescriptor[] = [
  { key: "new", min: 0, labelKey: "mastery.new" },
  { key: "learning", min: 20, labelKey: "mastery.learning" },
  { key: "familiar", min: 40, labelKey: "mastery.familiar" },
  { key: "proficient", min: 60, labelKey: "mastery.proficient" },
  { key: "mastered", min: 80, labelKey: "mastery.mastered" },
];

export const MASTERY_LEVEL_ORDER: readonly MasteryLevel[] = MASTERY_LEVELS.map(
  (level) => level.key
);

export function getMasteryLevel(score: number): MasteryLevel {
  let level: MasteryLevel = MASTERY_LEVEL_ORDER[0];
  for (const descriptor of MASTERY_LEVELS) {
    if (score >= descriptor.min) {
      level = descriptor.key;
    }
  }
  return level;
}

export function getMasteryLevelIndex(score: number): number {
  return MASTERY_LEVEL_ORDER.indexOf(getMasteryLevel(score));
}
