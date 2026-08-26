import type { Words } from "@/lib/wordsStore";

export const MAX_ADD_WORD_LENGTH = 50;

const WORD_RUN_PATTERN = /[a-zA-Z]+/;

export const extractWordFromSelection = (text: string): string | null => {
  if (!text) return null;
  const match = text.match(WORD_RUN_PATTERN);
  if (!match) return null;
  const word = match[0].toLowerCase();
  if (word.length > MAX_ADD_WORD_LENGTH) return null;
  return word;
};

export type WordAddableStatus = "ok" | "exists" | "invalid";

export const checkWordAddable = (
  words: Words,
  word: string
): WordAddableStatus => {
  if (words.wordData.has(word)) return "exists";
  if (!/^[a-zA-Z]+$/.test(word) || word.length > MAX_ADD_WORD_LENGTH) {
    return "invalid";
  }
  return "ok";
};