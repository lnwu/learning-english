import { isValidWordToken } from "@/lib/lemma";

const WORD_RUN_PATTERN = /[a-zA-Z]+/;

export const extractWordFromSelection = (text: string): string | null => {
  if (!text) return null;
  const match = text.match(WORD_RUN_PATTERN);
  if (!match) return null;
  const word = match[0].toLowerCase();
  return isValidWordToken(word) ? word : null;
};

export type WordAddableStatus = "ok" | "exists" | "invalid";

export const checkWordAddable = (
  isKnown: (word: string) => boolean,
  word: string,
): WordAddableStatus => {
  if (isKnown(word)) return "exists";
  return isValidWordToken(word) ? "ok" : "invalid";
};
