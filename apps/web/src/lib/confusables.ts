import { extractResultItems, type ChatMessage } from "@/lib/aiClient";
import { sanitizeWordSenses, type WordSense } from "@/lib/wordSenses";

export const MAX_CONFUSABLES_WORDS = 800;
export const MAX_CONFUSABLES_PER_WORD = 8;

export interface ConfusableWordInput {
  word: string;
  senses: WordSense[];
}

export interface ConfusableSenses {
  word: string;
  senses: WordSense[];
}

const GROUP_EXAMPLES =
  "如 medicine 与 medication、replicate 与 duplicate、associated 与 corresponding";

const stripTrailingQualifier = (chinese: string): string =>
  chinese.replace(/(?:[（(][^）)]*[）)]\s*)+$/, "").trim();

const compactWords = (words: ConfusableWordInput[]): string =>
  JSON.stringify(
    words.map(({ word, senses }) => ({
      word,
      senses: senses.map(({ pos, chinese }) => ({ pos, chinese: stripTrailingQualifier(chinese) })),
    })),
  );

export const buildConfusableGroupsMessages = (words: ConfusableWordInput[]): ChatMessage[] => [
  {
    role: "system",
    content: [
      "你是一位英语词典编辑，熟悉中国学习者容易混淆的英文近义词。",
      "用户会给出其词书中的全部单词（JSON 数组，义项只保留 pos 与 chinese）。",
      `任务：找出其中所有易混词组——中文译名相同或相近、含义接近，根据中文释义回忆英文时容易张冠李戴的词（${GROUP_EXAMPLES}）。`,
      "只给出词组，不要改写释义、不要解释：每组至少 2 个词，词必须来自输入的单词列表，每个词最多出现在一个词组里；没有易混关系的词不要出现在结果中。",
      '只返回 JSON，不要添加其它字段：{"groups": [["medicine", "medication"], ["replicate", "duplicate"]]}',
    ].join("\n"),
  },
  { role: "user", content: compactWords(words) },
];

export const parseConfusableGroups = (
  raw: unknown,
  allowedWords: readonly string[],
): string[][] => {
  const allowed = new Set(allowedWords);
  const groups =
    typeof raw === "object" && raw !== null ? (raw as { groups?: unknown }).groups : null;
  const used = new Set<string>();
  const parsed: string[][] = [];

  for (const group of Array.isArray(groups) ? groups : []) {
    if (!Array.isArray(group)) continue;

    const members: string[] = [];
    for (const item of group) {
      const word = typeof item === "string" ? item.trim().toLowerCase() : "";
      if (!word || !allowed.has(word) || used.has(word) || members.includes(word)) continue;
      members.push(word);
    }
    if (members.length < 2) continue;

    const kept = members.slice(0, MAX_CONFUSABLES_PER_WORD);
    kept.forEach((word) => used.add(word));
    parsed.push(kept);
  }

  return parsed;
};

const REWRITE_RULES = [
  "对每个词重写其 senses：",
  "1. 保持原有含义、义项顺序与词性 pos 不变；",
  "2. chinese 在不改变原意的前提下改写，使同组词的中文译名明确可区分，可用括号注明侧重点、搭配对象或语境（不超过 20 个字）；",
  "3. english 重新生成一句学习型词典风格的简短英文释义，不超过 15 个单词；",
  "4. note 必填：一句中文（不超过 40 个字），只用同组的其他词与它对比，说明用法差别；提到这些词时必须写英文拼写，不得提及词库外的单词，也不要出现该单词本身。",
];

const RESPONSE_FORMAT =
  '只返回 JSON，不要添加其它字段或解释：{"results": [{"word": "...", "senses": [{"pos": "...", "chinese": "...", "english": "...", "note": "..."}]}]}';

export const buildConfusableSensesMessages = (group: ConfusableWordInput[]): ChatMessage[] => [
  {
    role: "system",
    content: [
      "你是一位英语词典编辑，熟悉中国学习者容易混淆的英文近义词。",
      `用户会给出同一组易混词（${GROUP_EXAMPLES}）。`,
      ...REWRITE_RULES,
      RESPONSE_FORMAT,
    ].join("\n"),
  },
  { role: "user", content: compactWords(group) },
];

const sanitizeNote = (
  note: string | undefined,
  word: string,
  allowed: ReadonlySet<string>,
): string | undefined => {
  if (!note) return undefined;
  const mentioned = note.match(/[A-Za-z]{2,}/g) ?? [];
  const onlyGroupWords = mentioned.every((token) => {
    const lower = token.toLowerCase();
    return lower !== word && allowed.has(lower);
  });
  return onlyGroupWords ? note : undefined;
};

export const parseConfusableSenses = (
  raw: unknown,
  groupWords: readonly string[],
): ConfusableSenses[] => {
  const allowed = new Set(groupWords);
  const results: ConfusableSenses[] = [];

  for (const record of extractResultItems(raw)) {
    const word = typeof record.word === "string" ? record.word.trim().toLowerCase() : "";
    if (!word || !allowed.has(word) || results.some((item) => item.word === word)) continue;

    const senses = sanitizeWordSenses(record.senses).map(({ pos, chinese, english, note }) => {
      const kept = sanitizeNote(note, word, allowed);
      return kept ? { pos, chinese, english, note: kept } : { pos, chinese, english };
    });
    if (senses.length === 0) continue;

    results.push({ word, senses });
  }

  return results;
};
