"use client";

import { Button, Input, SyncIndicator } from "@/components/ui";
import { useSentencePractice, useLocale } from "@/hooks";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

const Sentence = observer(() => {
  const { loading, question, feedback, generating, checking, error, generate, check, words, syncing, pendingCount, syncToFirestore } = useSentencePractice();
  const { t } = useLocale();
  const [answer, setAnswer] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [hasTriedInitialGenerate, setHasTriedInitialGenerate] = useState(false);
  const noWords = words.allWords.size < 2;

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || loading || noWords || question || generating || hasTriedInitialGenerate) {
      return;
    }
    setHasTriedInitialGenerate(true);
    generate();
  }, [generate, generating, hasTriedInitialGenerate, isClient, loading, noWords, question]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!answer.trim() || checking) return;
    const result = await check(answer.trim());
    if (result?.score === 100) {
      await handleNext();
    }
  };

  const handleNext = async () => {
    setAnswer("");
    await generate();
  };

  if (loading) {
    return (
      <main>
        <div className="text-center">{t("common.loading")}</div>
      </main>
    );
  }

  if (!isClient) {
    return null;
  }

  return (
    <>
      <SyncIndicator syncing={syncing} pendingCount={pendingCount} onManualSync={syncToFirestore} />
      <main className="w-full max-w-xl px-4">
        <h1 className="text-xl font-bold mb-4 text-center">{t("sentence.title")}</h1>

        {noWords ? (
          <div className="text-center space-y-4">
            <p className="text-gray-500">{t("sentence.needMoreWords")}</p>
            <Link href="/add-word">
              <Button>{t("addWord.title")}</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {!question && !generating && error && (
              <div className="text-center">
                <Button onClick={handleNext}>{t("sentence.next")}</Button>
              </div>
            )}

            {generating && <div className="text-center text-gray-500">{t("sentence.generating")}</div>}

            {error && (
              <div className="text-center text-red-500">{error === "insufficientWords" ? t("sentence.needMoreWords") : error}</div>
            )}

            {question && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="text-sm text-gray-500">{t("sentence.words")}: {question.words.join(", ")}</div>
                  <div className="text-lg font-semibold">{question.chinese}</div>
                  <div className="text-sm text-gray-500">{t("sentence.grammarPoint")}: {question.grammarPoint}</div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-2">
                  <Input
                    type="text"
                    placeholder={t("sentence.answerPlaceholder")}
                    value={answer}
                    autoFocus
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  <div className="flex space-x-2 justify-end">
                    <Button type="submit" disabled={!answer.trim() || checking}>
                      {checking ? t("sentence.checking") : t("sentence.submit")}
                    </Button>
                    <Button type="button" onClick={handleNext} disabled={generating || checking}>
                      {t("sentence.next")}
                    </Button>
                  </div>
                </form>

                {feedback && (
                  <div className={`rounded-lg border p-4 space-y-2 ${feedback.correct ? "border-green-500" : "border-red-500"}`}>
                    <div className="font-semibold">
                      {feedback.correct ? t("sentence.resultCorrect") : t("sentence.resultIncorrect")} · {t("sentence.score")}: {feedback.score}
                    </div>
                    {feedback.feedback && <div className="text-sm">{feedback.feedback}</div>}
                    {feedback.issues.length > 0 && (
                      <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                        {feedback.issues.map((issue, index) => (
                          <li key={index}>{issue}</li>
                        ))}
                      </ul>
                    )}
                    {feedback.corrected && (
                      <div className="text-sm">
                        <span className="text-gray-500">{t("sentence.reference")}: </span>
                        {feedback.corrected}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center mt-6">
          <Button asChild type="button" variant="outline">
            <Link href="/home">{t("practiceHub.back")}</Link>
          </Button>
        </div>
      </main>
    </>
  );
});

export default Sentence;
