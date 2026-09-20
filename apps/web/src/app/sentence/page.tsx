"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Empty,
  EmptyHeader,
  EmptyTitle,
  LoadingState,
  PageContainer,
  PageHeader,
  SyncIndicator,
  Textarea,
} from "@/components/ui";
import { CheckIcon, XIcon } from "lucide-react";
import { useSentencePractice, useLocale, usePracticeTimeTracker } from "@/hooks";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";

const Sentence = observer(() => {
  const { loading, loadError, question, feedback, generating, checking, error, generate, check, words, syncing, pendingCount, syncToFirestore } = useSentencePractice();
  const { t } = useLocale();
  usePracticeTimeTracker();
  const [answer, setAnswer] = useState("");
  const [hasChecked, setHasChecked] = useState(false);
  const [lastCheckedAnswer, setLastCheckedAnswer] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [hasTriedInitialGenerate, setHasTriedInitialGenerate] = useState(false);
  const noWords = words.wordData.size < 2;

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setHasChecked(false);
    setLastCheckedAnswer("");
  }, [question]);

  useEffect(() => {
    if (!isClient || loading || noWords || question || generating || hasTriedInitialGenerate) {
      return;
    }
    setHasTriedInitialGenerate(true);
    generate();
  }, [generate, generating, hasTriedInitialGenerate, isClient, loading, noWords, question]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || checking) return;
    if (hasChecked && trimmed === lastCheckedAnswer) return;
    const result = await check(trimmed);
    if (result) {
      const firstCheck = !hasChecked;
      setHasChecked(true);
      setLastCheckedAnswer(trimmed);
      if (firstCheck && result.score === 100) {
        await handleNext();
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleNext = async () => {
    setAnswer("");
    await generate();
  };

  if (loading) {
    return (
      <PageContainer width="narrow">
        <LoadingState label={t("common.loading")} />
      </PageContainer>
    );
  }

  if (!isClient) {
    return null;
  }

  return (
    <>
      <SyncIndicator syncing={syncing} pendingCount={pendingCount} onManualSync={syncToFirestore} />
      <PageContainer width="narrow">
        <PageHeader
          className="mb-6"
          title={t("sentence.title")}
          actions={
            <Button render={<Link href="/home" />} nativeButton={false} variant="ghost">
              {t("practiceHub.back")}
            </Button>
          }
        />

        {noWords ? (
          loadError ? (
            <Alert variant="destructive">
              <AlertTitle>{t("common.error")}</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>{t("sentence.needMoreWords")}</EmptyTitle>
              </EmptyHeader>
              <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
                {t("addWord.title")}
              </Button>
            </Empty>
          )
        ) : (
          <div className="flex flex-col gap-4">
            {!question && !generating && error && (
              <div className="flex justify-center">
                <Button onClick={handleNext} variant="outline">{t("sentence.next")}</Button>
              </div>
            )}

            {generating && <LoadingState label={t("sentence.generating")} />}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error === "insufficientWords" ? t("sentence.needMoreWords") : error}
                </AlertDescription>
              </Alert>
            )}

            {question && (
              <div className="flex flex-col gap-4">
                <Card>
                  <CardContent className="text-base font-medium">
                    {question.chinese}
                  </CardContent>
                </Card>

                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                  <Textarea
                    rows={3}
                    className="max-h-60 resize-y overflow-y-auto"
                    placeholder={t("sentence.answerPlaceholder")}
                    value={answer}
                    autoFocus
                    disabled={checking}
                    onKeyDown={handleKeyDown}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="submit"
                      disabled={!answer.trim() || checking || (hasChecked && answer.trim() === lastCheckedAnswer)}
                    >
                      {checking ? t("sentence.checking") : hasChecked ? t("sentence.recheck") : t("sentence.submit")}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleNext} disabled={generating || checking}>
                      {t("sentence.next")}
                    </Button>
                  </div>
                </form>

                {feedback && (
                  <Card className={feedback.correct ? "ring-success/30" : "ring-destructive/30"}>
                    <CardContent className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-medium">
                        {feedback.correct ? (
                          <CheckIcon className="size-4 text-success" />
                        ) : (
                          <XIcon className="size-4 text-destructive" />
                        )}
                        {feedback.correct ? t("sentence.resultCorrect") : t("sentence.resultIncorrect")} · {t("sentence.score")}: {feedback.score}
                      </div>
                      {feedback.feedback && <div className="text-sm">{feedback.feedback}</div>}
                      {feedback.issues.length > 0 && (
                        <ul className="flex list-inside list-disc flex-col gap-1 text-sm text-destructive">
                          {feedback.issues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      )}
                      {feedback.corrected && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">{t("sentence.reference")}: </span>
                          {feedback.corrected}
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">{t("sentence.words")}: {question.words.join(", ")}</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </>
  );
});

export default Sentence;
