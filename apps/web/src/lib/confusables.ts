import { extractResultItems, type ChatMessage } from "@/lib/deepseek";
import { MAX_CONFUSABLES_PER_WORD } from "@/lib/wordDoc";
import { sanitizeWordSenses, type WordSense } from "@/lib/wordSenses";

export const MAX_CONFUSABLES_WORDS = 800;

export interface ConfusableWordInput {
  word: string;
  senses: WordSense[];
}

export interface ConfusableResult {
  word: string;
  confusables: string[];
  senses: WordSense[];
}

const REWRITE_RULES = [
  "对每个同组的词重写其 senses：",
  "1. 保持原有含义、义项顺序与词性 pos 不变；",
  "2. chinese 在不改变原意的前提下改写，使同组词的中文译名明确可区分，可用括号注明侧重点、搭配对象或语境（不超过 20 个字）；",
  "3. english 重新生成一句学习型词典风格的简短英文释义，不超过 15 个单词；",
  "4. note 必填：一句中文（不超过 40 个字），说明该词与同组其他词的用法差别，必须点名词组内的对比词（英文原词），但不要出现该单词本身；",
  "5. confusables 列出同组的其他单词，必须来自输入的单词列表。",
];

const RESPONSE_FORMAT =
  '只返回 JSON，不要添加其它字段或解释：{"results": [{"word": "...", "confusables": ["..."], "senses": [{"pos": "...", "chinese": "...", "english": "...", "note": "..."}]}]}';

const GROUP_EXAMPLES =
  "如 medicine 与 medication、replicate 与 duplicate、associated 与 corresponding";

const compactWords = (words: ConfusableWordInput[]): string =>
  JSON.stringify(
    words.map(({ word, senses }) => ({
      word,
      senses: senses.map(({ pos, chinese }) => ({ pos, chinese })),
    })),
  );

export const buildConfusablesMessages = (
  words: ConfusableWordInput[],
  focus?: string,
): ChatMessage[] => {
  if (focus) {
    const target = words.filter((item) => item.word === focus);
    const others = words.filter((item) => item.word !== focus);
    return [
      {
        role: "system",
        content: [
          "你是一位英语词典编辑，熟悉中国学习者容易混淆的英文近义词。",
          "用户会给出词书中的一个目标单词和词书中的其他单词（JSON，义项只保留 pos 与 chinese）。",
          `任务：从其他单词中找出与目标单词易混的词——中文译名相同或相近、含义接近，根据中文释义回忆英文时容易张冠李戴（${GROUP_EXAMPLES}）。没有易混词时 results 返回空数组；找到时 results 必须同时包含目标单词和它的每个易混词。`,
          ...REWRITE_RULES,
          RESPONSE_FORMAT,
        ].join("\n"),
      },
      {
        role: "user",
        content: `目标单词：${compactWords(target)}\n其他单词：${compactWords(others)}`,
      },
    ];
  }

  return [
    {
      role: "system",
      content: [
        "你是一位英语词典编辑，熟悉中国学习者容易混淆的英文近义词。",
        "用户会给出其词书中的全部单词（JSON 数组，义项只保留 pos 与 chinese）。",
        `任务：找出其中所有易混词组——中文译名相同或相近、含义接近，根据中文释义回忆英文时容易张冠李戴的词（${GROUP_EXAMPLES}）。一词可以属于多组，没有易混关系的词不要出现在结果中。`,
        ...REWRITE_RULES,
        RESPONSE_FORMAT,
      ].join("\n"),
    },
    { role: "user", content: compactWords(words) },
  ];
};

export const parseConfusablesResults = (
  raw: unknown,
  allowedWords: readonly string[],
): ConfusableResult[] => {
  const allowed = new Set(allowedWords);
  const byWord = new Map<string, { confusables: string[]; senses: WordSense[] }>();

  for (const record of extractResultItems(raw)) {
    const word = typeof record.word === "string" ? record.word.trim().toLowerCase() : "";
    if (!word || !allowed.has(word) || byWord.has(word)) continue;

    const senses = sanitizeWordSenses(record.senses);
    if (senses.length === 0) continue;

    const confusables = Array.from(
      new Set(
        (Array.isArray(record.confusables) ? record.confusables : [])
          .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
          .filter((item) => item !== "" && item !== word && allowed.has(item)),
      ),
    );

    byWord.set(word, { confusables, senses });
  }

  const neighbors = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    const linked = neighbors.get(from) ?? new Set<string>();
    linked.add(to);
    neighbors.set(from, linked);
  };
  for (const [word, entry] of byWord) {
    for (const other of entry.confusables) {
      if (!byWord.has(other)) continue;
      link(word, other);
      link(other, word);
    }
  }

  const visited = new Set<string>();
  const results: ConfusableResult[] = [];
  for (const word of byWord.keys()) {
    if (visited.has(word)) continue;
    visited.add(word);

    const members: string[] = [];
    const queue = [word];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) break;
      members.push(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    if (members.length < 2) continue;
    members.sort();
    for (const member of members) {
      const entry = byWord.get(member);
      if (!entry) continue;
      results.push({
        word: member,
        confusables: members
          .filter((candidate) => candidate !== member)
          .slice(0, MAX_CONFUSABLES_PER_WORD),
        senses: entry.senses,
      });
    }
  }

  return results.sort((a, b) => a.word.localeCompare(b.word));
};
