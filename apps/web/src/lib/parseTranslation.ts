export interface WordSense {
  pos: string;
  chinese: string;
  english: string;
}

export interface ParsedTranslation {
  senses: WordSense[];
}

const SENSE_LINE_PATTERN = /^([a-zA-Z]+\.)\s+(.+?)\s*—\s*(.+)$/;

export const parseTranslation = (translation: string): ParsedTranslation => {
  const lines = translation
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { senses: [] };
  }

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

  return { senses };
};

export const formatSenses = (senses: WordSense[]): string => {
  return senses
    .map((sense) => {
      const head = [sense.pos, sense.chinese].filter(Boolean).join(" ");
      const english = sense.english ? (head ? ` — ${sense.english}` : sense.english) : "";
      return `${head}${english}`.trim();
    })
    .join("\n");
};
