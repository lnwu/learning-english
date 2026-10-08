"use client";

import { useMemo } from "react";
import { useLocale } from "@/hooks";
import type { TranslationKey } from "@/lib/i18n";
import { decodeSenses } from "@/lib/wordSenses";
import type { WordSource, WordSourceKind } from "@/lib/wordSources";

const KIND_LABEL_KEYS: Record<WordSourceKind, TranslationKey> = {
  wikipedia: "source.kind.wikipedia",
  stackexchange: "source.kind.stackexchange",
  urbandictionary: "source.kind.urbandictionary",
};

interface WordDefinitionProps {
  translation: string;
  sources: readonly WordSource[];
}

export const WordDefinition = ({ translation, sources }: WordDefinitionProps) => {
  const { t } = useLocale();
  const senses = useMemo(() => decodeSenses(translation), [translation]);

  if (senses.length === 0) {
    return <div className="text-muted-foreground italic">{t("home.noTranslation")}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {senses.map((sense, index) => (
        <div key={index} className="flex flex-col gap-1">
          <div className="whitespace-pre-line font-medium">
            <span className="text-muted-foreground">{sense.pos}</span> {sense.english}
            {sense.chinese && (
              <span className="font-normal text-muted-foreground">
                {" — "}
                {sense.chinese}
              </span>
            )}
          </div>
          {sources
            .filter((source) => source.senseIndex === index)
            .map((source) => (
              <a
                key={`${source.kind}:${source.senseIndex}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="self-end text-right text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                {source.excerpt}{" "}
                <span className="whitespace-nowrap">- {t(KIND_LABEL_KEYS[source.kind])}</span>
              </a>
            ))}
        </div>
      ))}
    </div>
  );
};
