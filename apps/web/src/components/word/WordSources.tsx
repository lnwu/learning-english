"use client";

import { useLocale } from "@/hooks";
import type { TranslationKey } from "@/lib/i18n";
import type { WordSource, WordSourceKind } from "@/lib/wordSources";

const KIND_LABEL_KEYS: Record<WordSourceKind, TranslationKey> = {
  wikipedia: "source.kind.wikipedia",
  stackexchange: "source.kind.stackexchange",
  urbandictionary: "source.kind.urbandictionary",
};

interface WordSourcesProps {
  sources: readonly WordSource[];
}

export const WordSources = ({ sources }: WordSourcesProps) => {
  const { t } = useLocale();

  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">{t("source.heading")}</div>
      <ul className="flex flex-col divide-y">
        {sources.map((source) => (
          <li key={source.url} className="flex flex-col gap-1 py-2 text-sm">
            <div className="flex flex-wrap gap-2 text-muted-foreground">
              <span>{t(KIND_LABEL_KEYS[source.kind])}</span>
              <span>{t("source.sense", { index: source.senseIndex + 1 })}</span>
            </div>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline-offset-4 hover:underline"
            >
              {source.title}
            </a>
            <p className="text-muted-foreground">{source.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};
