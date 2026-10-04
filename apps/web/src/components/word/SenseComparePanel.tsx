"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/hooks";
import type { SenseCompareState } from "@/hooks/useSenseCompare";
import { encodeSenses } from "@/lib/wordSenses";
import type { TranslateCompareResult } from "@/lib/translateCompare";

interface SenseComparePanelProps {
  word: string;
  compare: SenseCompareState;
  showLemma?: boolean;
  onUseResult: (result: TranslateCompareResult) => void | Promise<void>;
}

export const SenseComparePanel = ({
  word,
  compare,
  showLemma = false,
  onUseResult,
}: SenseComparePanelProps) => {
  const { t } = useLocale();
  const [applyingModel, setApplyingModel] = useState<string | null>(null);
  const { models, selection, results, comparing, toggleModel, generate } = compare;

  const handleUse = async (result: TranslateCompareResult) => {
    setApplyingModel(result.model);
    try {
      await onUseResult(result);
    } finally {
      setApplyingModel(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap gap-2">
        {models.map((model) => (
          <Button
            key={model.id}
            size="sm"
            variant={selection.includes(model.id) ? "default" : "outline"}
            onClick={() => toggleModel(model.id)}
          >
            {model.label}
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        className="self-start"
        onClick={() => void generate(word, selection)}
        disabled={comparing || selection.length === 0}
      >
        {comparing ? t("senses.comparing") : t("senses.compareStart")}
      </Button>
      {results && (
        <div className="flex flex-col gap-2">
          {results.map((result) => {
            const label = models.find((model) => model.id === result.model)?.label ?? result.model;
            const senses = result.senses ?? [];
            return (
              <div key={result.model} className="rounded-md border p-2 text-sm">
                <div className="font-medium">{label}</div>
                {result.error ? (
                  <div className="text-destructive">{result.error}</div>
                ) : senses.length > 0 ? (
                  <>
                    {showLemma && result.lemma && result.lemma !== word && (
                      <div className="text-muted-foreground">
                        {word} → {result.lemma}
                      </div>
                    )}
                    <div className="whitespace-pre-line text-muted-foreground">
                      {encodeSenses(senses)}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={applyingModel !== null}
                      onClick={() => void handleUse(result)}
                    >
                      {t("senses.useResult")}
                    </Button>
                  </>
                ) : (
                  <div className="text-muted-foreground">{t("senses.compareNotRecognized")}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
