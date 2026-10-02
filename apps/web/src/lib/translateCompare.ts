import type { WordSense } from "@/lib/wordSenses";

export const MAX_COMPARE_MODELS = 4;

export interface TranslateCompareResult {
  model: string;
  lemma?: string;
  senses?: WordSense[] | null;
  error?: string;
}
