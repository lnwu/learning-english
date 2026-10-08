"use client";

import { useMemo } from "react";
import { useLocale } from "@/hooks";
import { cn } from "@/lib/utils";
import { decodeSenses } from "@/lib/wordSenses";

interface WordSensesProps {
  translation: string;
  className?: string;
}

export const WordSenses = ({ translation, className }: WordSensesProps) => {
  const { t } = useLocale();
  const senses = useMemo(() => decodeSenses(translation), [translation]);
  const hasSense = senses.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col whitespace-pre-line",
        hasSense ? "font-medium" : "text-muted-foreground italic",
        className,
      )}
    >
      {hasSense
        ? senses.map((sense, index) => (
            <span key={index}>
              <span className="text-muted-foreground">{sense.pos}</span> {sense.english}
              {sense.chinese && (
                <span className="text-sm font-normal text-muted-foreground">
                  {" — "}
                  {sense.chinese}
                </span>
              )}
            </span>
          ))
        : t("home.noTranslation")}
    </div>
  );
};
