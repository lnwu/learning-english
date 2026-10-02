import type { WordSense } from "@/lib/wordSenses";

export interface TranslateCompareResult {
  model: string;
  lemma?: string;
  senses?: WordSense[] | null;
  error?: string;
}
