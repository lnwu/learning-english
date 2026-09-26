export interface WordSense {
  pos: string;
  chinese: string;
  english: string;
}

export const MAX_SENSES = 4;
const MAX_POS_LENGTH = 10;
const MAX_DEFINITION_LENGTH = 150;
const MAX_TRANSLATION_LENGTH = 50;

const SENSE_LINE_PATTERN = /^([a-zA-Z]+\.)\s+(.+?)\s*—\s*(.+)$/;

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

export const encodeSenses = (senses: WordSense[]): string =>
  senses
    .map((sense) => {
      const head = [sense.pos, sense.chinese].filter(Boolean).join(" ");
      const english = sense.english
        ? head
          ? ` — ${sense.english}`
          : sense.english
        : "";
      return `${head}${english}`.trim();
    })
    .join("\n");

export const decodeSenses = (translation: string): WordSense[] => {
  const lines = translation
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const senses: WordSense[] = [];
  let legacyEnglish: string | null = null;

  for (const line of lines) {
    const match = SENSE_LINE_PATTERN.exec(line);
    if (match) {
      senses.push({ pos: match[1], chinese: match[2], english: match[3] });
    } else if (/[\u4e00-\u9fff]/.test(line)) {
      const last = senses[senses.length - 1];
      if (last && last.chinese && !last.pos && !last.english) {
        last.chinese = `${last.chinese}\n${line}`;
      } else {
        senses.push({ pos: "", chinese: line, english: "" });
      }
    } else {
      legacyEnglish = line;
    }
  }

  if (legacyEnglish) {
    const firstChinese = senses.find((sense) => sense.chinese && !sense.english);
    if (firstChinese) {
      firstChinese.english = legacyEnglish;
    } else {
      senses.unshift({ pos: "", chinese: "", english: legacyEnglish });
    }
  }

  return senses;
};
