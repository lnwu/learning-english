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
      {senses.map((sense, index) => {
        const senseSources = sources.filter((source) => source.senseIndex === index);

        return (
          <div key={index} className="flex flex-col gap-2">
            <div className="whitespace-pre-line">
              <span className="text-muted-foreground">{sense.pos}</span>{" "}
              <span className="font-medium">{sense.english}</span>
              {sense.chinese && (
                <span className="text-muted-foreground">
                  {" — "}
                  {sense.chinese}
                </span>
              )}
            </div>
            {senseSources.length > 0 && (
              <div className="flex flex-col gap-2 border-l pl-3">
                {senseSources.map((source) => (
                  <div
                    key={`${source.kind}:${source.senseIndex}`}
                    className="flex flex-col gap-0.5 text-sm text-muted-foreground"
                  >
                    <span>{source.excerpt}</span>
                    <span className="text-xs">{t(KIND_LABEL_KEYS[source.kind])}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
