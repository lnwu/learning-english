import type { ChatMessage } from "@/lib/deepseek";
import { normalizeForComparison, resolveUsedWords, sanitizeUsedWords } from "@/lib/sentenceCompare";
import { MAX_SENTENCE_WORDS, MIN_SENTENCE_WORDS } from "@/lib/sentenceWords";

export const MAX_SENTENCE_LENGTH = 500;
export const MAX_TRANSLATION_LENGTH = 2000;

const MAX_FEEDBACK_LENGTH = 2000;
const MAX_CORRECTED_LENGTH = 500;
const MAX_ISSUES = 10;

export interface SentenceWord {
  word: string;
  translation: string;
}

export interface GenerateResult {
  chinese: string;
  english: string;
  words: string[];
}

export interface CheckInput {
  chinese: string;
  words: string[];
  reference: string;
  userAnswer: string;
}

export interface CheckResult {
  correct: boolean;
  score: number;
  feedback: string;
  corrected: string;
  issues: string[];
  usedWords: string[];
}

export const buildGenerateMessages = (candidates: SentenceWord[]): ChatMessage[] => [
  {
    role: "system",
    content: [
      "你是一位英语母语者。请根据用户提供的候选英文单词设计一道造句练习题：先从中挑选 2-3 个能自然地出现在同一个真实生活场景里的词，再造一个自然、地道、像 native speaker 日常会说的英文句子，用于让用户看中文译回英文的练习。",
      "要求：",
      "1. 先在心里想一个真实生活中会同时用到所选词的具体场景，再写句子：内容必须符合常识，句子读起来像真人随口说出的话。",
      "2. 不得为了让某个词出现而编造离奇、荒诞、牵强的情节、因果、对比或比喻；如果候选词很难共现，就选择最容易自然搭配的词，写一句平实的日常陈述，宁可句子朴素也不要硬凑。",
      "3. 在同样自然的前提下，优先选择更值得练习的词（抽象名词、动词、形容词、固定搭配优先于最容易使用的具体名词）。",
      "4. 所选单词必须自然地使用，允许自然的语法变形（如时态、单复数变化）；搭配应是英语母语者最常用的说法。",
      "5. 句子长度控制在 10-20 个单词。不要为了练习某个语法点而刻意使用复杂或不自然的时态、语态或句式。",
      "6. 除所选单词外，其余词汇使用常见基础词汇，避免生僻词和专有名词。",
      "7. chinese 必须是自然地道的现代中文，同时与 english 语义一一对应；不要逐字硬译（翻译腔），也不要意译或添加原文没有的信息。所选词在 chinese 中应使用给定的参考译法，确保学生只看中文（看不到所选单词列表）就能想到并使用这些词译回英文。",
      '只返回 JSON，格式如下，不要添加其它字段或解释：{"words": ["所选单词，2-3 个，使用候选词原文"], "english": "...", "chinese": "..."}',
    ].join("\n"),
  },
  {
    role: "user",
    content: `候选词（括号内为该词的参考中文译法）：${candidates
      .map((item) => (item.translation ? `${item.word}（${item.translation}）` : item.word))
      .join(", ")}`,
  },
];

const sanitizeGeneratedWords = (raw: unknown, candidates: readonly string[]): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    const candidate = candidates.find((word) => word.toLowerCase() === normalized);
    if (!candidate) continue;
    seen.add(normalized);
    words.push(candidate);
    if (words.length >= MAX_SENTENCE_WORDS) break;
  }
  return words;
};

export const parseGenerateResult = (
  raw: unknown,
  candidates: readonly string[],
): GenerateResult | null => {
  const result = (raw ?? {}) as Partial<GenerateResult>;
  const chinese = typeof result.chinese === "string" ? result.chinese.trim() : "";
  const english = typeof result.english === "string" ? result.english.trim() : "";
  const words = sanitizeGeneratedWords(result.words, candidates);
  if (!chinese || !english || words.length < MIN_SENTENCE_WORDS) {
    return null;
  }
  return { chinese, english, words };
};

export const buildCheckMessages = (input: CheckInput): ChatMessage[] => [
  {
    role: "system",
    content: [
      "你是一位英语母语者。给定一句中文、需要使用的目标单词、一个参考表达，以及用户写的英文句子，请根据英语母语者的直觉判断这句话是否自然、清晰，以及目标单词的含义和搭配是否使用准确。注意：用户看不到目标单词列表，只能根据中文推断用词。",
      "评分规则：",
      "1. 大小写、标点差异不计入错误。",
      "2. 用户不需要逐字复刻参考表达；即使使用不同的时态、语态、词序或句式，只要意思基本符合中文且表达自然，也应认可，不要像中国英语考试一样要求特定语法形式。",
      "3. 若用户未使用某个目标单词，但使用了自然、准确的同义表达，不要仅因未使用指定单词判错，只需在 feedback 中提示该目标词。",
      "4. 只有语法错误确实影响理解或导致表达不自然时才指出。",
      "只返回 JSON，字段为：correct（布尔值，是否达到自然且正确的表达）、score（0-100 的整数评分）、feedback（用中文给出总体点评与建议）、corrected（修改后的自然英文句子；如果原句已经自然正确则保留原句）、issues（字符串数组，逐条列出影响准确性、自然度或目标单词使用的问题，用中文；若无问题则为空数组）、usedWords（字符串数组，目标单词中用户在句子里实际用到的词，以自然同义表达替代的也算用到，完全未体现的词不要列入）。不要添加其它字段或解释。",
    ].join("\n"),
  },
  {
    role: "user",
    content: `中文句子：${input.chinese}\n目标单词：${input.words.join(", ")}\n参考译文：${input.reference}\n学生译文：${input.userAnswer}`,
  },
];

export const isExactMatchAnswer = (reference: string, userAnswer: string): boolean => {
  const normalizedAnswer = normalizeForComparison(userAnswer);
  return (
    reference.length > 0 &&
    normalizedAnswer.length > 0 &&
    normalizedAnswer === normalizeForComparison(reference)
  );
};

export const buildExactMatchResult = (reference: string, words: string[]): CheckResult => ({
  correct: true,
  score: 100,
  feedback: "答案正确，评分已按大小写不敏感处理。",
  corrected: reference,
  issues: [],
  usedWords: resolveUsedWords(reference, words),
});

export const parseCheckResult = (raw: unknown, words: string[]): CheckResult => {
  const result = (raw ?? {}) as Partial<CheckResult>;
  const score =
    typeof result.score === "number" && Number.isFinite(result.score)
      ? Math.min(100, Math.max(0, Math.round(result.score)))
      : 0;

  return {
    correct: Boolean(result.correct),
    score,
    feedback:
      typeof result.feedback === "string" ? result.feedback.slice(0, MAX_FEEDBACK_LENGTH) : "",
    corrected:
      typeof result.corrected === "string" ? result.corrected.slice(0, MAX_CORRECTED_LENGTH) : "",
    issues: Array.isArray(result.issues)
      ? result.issues
          .filter((issue): issue is string => typeof issue === "string")
          .slice(0, MAX_ISSUES)
      : [],
    usedWords: sanitizeUsedWords(result.usedWords, words),
  };
};
