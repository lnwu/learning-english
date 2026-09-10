import type { WordSense } from "@/lib/parseTranslation";

export const MAX_SENSES = 4;
export const MAX_POS_LENGTH = 10;
export const MAX_DEFINITION_LENGTH = 150;
export const MAX_TRANSLATION_LENGTH = 50;

export const sanitizeWordSenses = (value: unknown): WordSense[] => {
  if (!Array.isArray(value)) return [];

  const senses: WordSense[] = [];
  for (const raw of value.slice(0, MAX_SENSES)) {
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const pos = typeof record.pos === "string" ? record.pos.trim() : "";
    const chinese =
      typeof record.chinese === "string" ? record.chinese.trim() : "";
    const english =
      typeof record.english === "string" ? record.english.trim() : "";
    if (
      pos &&
      pos.length <= MAX_POS_LENGTH &&
      chinese &&
      chinese.length <= MAX_TRANSLATION_LENGTH &&
      english &&
      english.length <= MAX_DEFINITION_LENGTH
    ) {
      senses.push({ pos, chinese, english });
    }
  }

  return senses;
};
