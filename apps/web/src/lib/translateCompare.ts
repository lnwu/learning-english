import type { ApiErrorCode } from "@/lib/apiErrors";
import type { WordSense } from "@/lib/wordSenses";
import type { WordSource } from "@/lib/wordSources";

export interface TranslateCompareResult {
  model: string;
  lemma?: string;
  senses?: WordSense[] | null;
  sources?: WordSource[];
  code?: ApiErrorCode;
  error?: string;
}
