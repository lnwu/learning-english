export interface WordSense {
  pos: string;
  chinese: string;
  english: string;
  note?: string;
}

export const MAX_SENSES = 4;
export const MAX_NOTE_LENGTH = 60;
const MAX_POS_LENGTH = 10;
const MAX_DEFINITION_LENGTH = 150;
const MAX_TRANSLATION_LENGTH = 50;

export const SENSE_NOTE_PREFIX = "区分：";
const SENSE_NOTE_PATTERN = /^(?:区分|辨析)：/;
const SENSE_LINE_PATTERN = /^([a-zA-Z]+\.)\s+(.+?)\s*—\s*(.+)$/;

const cleanNote = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const note = value.replace(/\s+/g, " ").trim();
  if (!note || note.length > MAX_NOTE_LENGTH) return undefined;
  return note;
};

export const sanitizeWordSenses = (value: unknown): WordSense[] => {
  if (!Array.isArray(value)) return [];

  const senses: WordSense[] = [];
  for (const raw of value.slice(0, MAX_SENSES)) {
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const pos = typeof record.pos === "string" ? record.pos.trim() : "";
    const chinese = typeof record.chinese === "string" ? record.chinese.trim() : "";
    const english = typeof record.english === "string" ? record.english.trim() : "";
    if (
      pos &&
      pos.length <= MAX_POS_LENGTH &&
      chinese &&
      chinese.length <= MAX_TRANSLATION_LENGTH &&
      english &&
      english.length <= MAX_DEFINITION_LENGTH
    ) {
      const sense: WordSense = { pos, chinese, english };
      const note = cleanNote(record.note);
      if (note) sense.note = note;
      senses.push(sense);
    }
  }

  return senses;
};

export const encodeSenses = (senses: WordSense[]): string =>
  senses
    .map((sense) => {
      const head = [sense.pos, sense.chinese].filter(Boolean).join(" ");
      const english = sense.english ? (head ? ` — ${sense.english}` : sense.english) : "";
      const line = `${head}${english}`.trim();
      return sense.note ? `${line}\n${SENSE_NOTE_PREFIX}${sense.note}` : line;
    })
    .join("\n");

export const decodeSenses = (translation: string): WordSense[] => {
  const senses: WordSense[] = [];

  for (const line of translation.split("\n")) {
    const trimmed = line.trim();
    const noteMatch = SENSE_NOTE_PATTERN.exec(trimmed);
    if (noteMatch) {
      const previous = senses[senses.length - 1];
      const note = trimmed.slice(noteMatch[0].length).trim();
      if (previous && note) previous.note = note;
      continue;
    }
    const match = SENSE_LINE_PATTERN.exec(trimmed);
    if (match) senses.push({ pos: match[1], chinese: match[2], english: match[3] });
  }

  return senses;
};
