export interface WordSense {
  pos: string;
  chinese: string;
  english: string;
}

export const MAX_SENSES = 3;
const MAX_POS_TAG_LENGTH = 9;
const MAX_DEFINITION_LENGTH = 150;
const MAX_TRANSLATION_LENGTH = 50;
const SENSE_SEPARATOR = " — ";
const CJK_PATTERN = /[\u3400-\u9fff]/;

const normalizeInline = (value: string): string => value.replace(/\s+/g, " ").trim();

const normalizePos = (value: string): string => {
  const tag = /[a-z]+/.exec(value.toLowerCase())?.[0] ?? "";
  return tag && tag.length <= MAX_POS_TAG_LENGTH ? `${tag}.` : "";
};

const normalizeChinese = (value: string): string => normalizeInline(value.replace(/[—–]/g, " "));

export const sanitizeWordSenses = (value: unknown): WordSense[] => {
  if (!Array.isArray(value)) return [];

  const senses: WordSense[] = [];
  for (const raw of value.slice(0, MAX_SENSES)) {
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const pos = normalizePos(typeof record.pos === "string" ? record.pos : "");
    const chinese = normalizeChinese(typeof record.chinese === "string" ? record.chinese : "");
    const english = normalizeInline(typeof record.english === "string" ? record.english : "");
    if (
      pos &&
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
      const head = [sense.pos, sense.english].filter(Boolean).join(" ");
      const chinese = sense.chinese
        ? head
          ? `${SENSE_SEPARATOR}${sense.chinese}`
          : sense.chinese
        : "";
      return `${head}${chinese}`.trim();
    })
    .join("\n");

const pickSides = (a: string, b: string): [string, string] =>
  CJK_PATTERN.test(a) && !CJK_PATTERN.test(b) ? [b, a] : [a, b];

export const decodeSenses = (translation: string): WordSense[] => {
  const senses: WordSense[] = [];

  for (const line of translation.split("\n")) {
    const trimmed = line.trim();
    const separatorIndex = trimmed.lastIndexOf(SENSE_SEPARATOR);
    if (separatorIndex <= 0) continue;

    const head = trimmed.slice(0, separatorIndex);
    const tail = trimmed.slice(separatorIndex + SENSE_SEPARATOR.length).trim();
    const headMatch = /^(\S+)\s+(.+)$/.exec(head);
    if (!headMatch || !tail) continue;

    const [english, chinese] = pickSides(headMatch[2].trim(), tail);
    senses.push({ pos: headMatch[1], chinese, english });
  }

  return senses;
};

export const chineseTranslations = (translation: string): string =>
  decodeSenses(translation)
    .map((sense) => sense.chinese)
    .join("、");
