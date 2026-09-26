"use client";

import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  LoadingState,
  MasteryBar,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
  type RefObject,
} from "react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useFirestoreWords, useLocale, usePracticeTimeTracker } from "@/hooks";
import { decodeSenses } from "@/lib/wordSenses";
import {
  createPracticeInputState,
  evaluatePracticeInput,
  resolveReview,
  type PracticeInputState,
} from "@/lib/practiceInput";
import type { Words } from "@/lib/wordsStore";
import type { TranslationKey } from "@/lib/i18n";

interface WordRowProps {
  word: string;
  translation: string;
  words: Words;
  onInputChange: (word: string, value: string) => void;
  onHintReveal: (word: string) => void;
  inputRefs: RefObject<Map<string, HTMLInputElement>>;
  t: (key: TranslationKey) => string;
}

interface RoundAttempt {
  reviewed: boolean;
  hintUsed: boolean;
}

const WordRow = observer(
  ({ word, translation, words, onInputChange, onHintReveal, inputRefs, t }: WordRowProps) => {
    const inputValue = words.getUserInput(word);
    const senses = useMemo(() => decodeSenses(translation), [translation]);
    const hasSense = senses.some((sense) => sense.chinese);

    return (
      <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 py-4 first:pt-0">
        <div className="max-w-md min-w-0 text-left">
          <div
            className={cn(
              "flex min-h-8 flex-col items-start justify-start whitespace-pre-line",
              hasSense ? "font-medium" : "text-muted-foreground italic",
            )}
          >
            {hasSense
              ? senses.map((sense, index) => (
                  <span key={index}>
                    {[sense.pos, sense.chinese].filter(Boolean).join(" ")}
                    {sense.english && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        — {sense.english}
                      </span>
                    )}
                  </span>
                ))
              : t("home.noTranslation")}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input
            className="w-xs"
            type="text"
            id={word}
            ref={(el) => {
              if (el) {
                inputRefs.current.set(word, el);
              } else {
                inputRefs.current.delete(word);
              }
            }}
            onChange={(e) => onInputChange(word, e.target.value.toLowerCase())}
            value={inputValue}
          />
          <button
            type="button"
            title={word}
            aria-label={`${t("home.hint")}: ${word}`}
            disabled={inputValue === word}
            className={cn(
              "group relative rounded-md px-1 outline-none",
              inputValue !== word &&
                "cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
            onMouseEnter={() => {
              if (inputValue !== "" && inputValue !== word) {
                onHintReveal(word);
              }
            }}
            onFocus={() => {
              if (inputValue !== "" && inputValue !== word) {
                onHintReveal(word);
              }
            }}
            onClick={() => {
              if (inputValue !== word) {
                onHintReveal(word);
                const utterance = new SpeechSynthesisUtterance(word);
                utterance.lang = "en-US";
                speechSynthesis.speak(utterance);
              }
            }}
          >
            {inputValue === word ? (
              <CheckIcon className="size-4 text-success" />
            ) : (
              <XIcon className="size-4 text-muted-foreground" />
            )}
            {inputValue !== word && (
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {word}
              </span>
            )}
          </button>
          <MasteryBar score={words.getMasteryScore(word)} />
        </div>
      </li>
    );
  },
);

const SubmitButton = observer(
  ({
    randomWords,
    words,
    label,
  }: {
    randomWords: [string, string][];
    words: Words;
    label: string;
  }) => {
    const allCorrect =
      randomWords.length > 0 && randomWords.every(([word]) => words.getUserInput(word) === word);
    return (
      <Button type="submit" disabled={!allCorrect}>
        {label}
      </Button>
    );
  },
);

const WordsPractice = observer(() => {
  const { words, recordReview, loading, error } = useFirestoreWords();
  const { t } = useLocale();
  usePracticeTimeTracker();
  const [isClient, setIsClient] = useState(false);
  const [shouldFocusFirst, setShouldFocusFirst] = useState(false);
  const [randomWords, setRandomWords] = useState<[string, string][]>([]);
  const [roundInitialized, setRoundInitialized] = useState(false);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const inputStatesRef = useRef<Map<string, PracticeInputState>>(new Map());
  const attemptStatesRef = useRef<Map<string, RoundAttempt>>(new Map());

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize random words when words are loaded
  useEffect(() => {
    if (loading || words.wordCount === 0) {
      return;
    }
    if (randomWords.length === 0) {
      setRandomWords(words.getRandomWords());
    }
    setRoundInitialized(true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, words.wordCount, randomWords.length]);

  useEffect(() => {
    if (shouldFocusFirst && randomWords.length > 0) {
      const firstWord = randomWords[0][0];
      if (firstWord) {
        const firstInput = inputRefs.current.get(firstWord);
        if (firstInput) {
          firstInput.focus();
          setShouldFocusFirst(false);
        }
      }
    }
  }, [shouldFocusFirst, randomWords]);

  const refreshWords = () => {
    words.clearUserInputs();
    attemptStatesRef.current.clear();
    inputStatesRef.current.clear();
    setRandomWords(words.getRandomWords());
    setShouldFocusFirst(true);
  };

  const getAttemptState = useCallback((word: string): RoundAttempt => {
    const existing = attemptStatesRef.current.get(word);
    if (existing) {
      return existing;
    }
    const attempt: RoundAttempt = { reviewed: false, hintUsed: false };
    attemptStatesRef.current.set(word, attempt);
    return attempt;
  }, []);

  const handleInputChange = useCallback(
    (word: string, value: string) => {
      const previous = inputStatesRef.current.get(word) ?? createPracticeInputState();
      const decision = evaluatePracticeInput(previous, word, value, Date.now());
      inputStatesRef.current.set(word, decision);

      words.setUserInput(word, value);

      const attempt = getAttemptState(word);
      if (attempt.reviewed) {
        return;
      }
      const review = resolveReview(decision, attempt.hintUsed);
      if (!review) {
        return;
      }
      attempt.reviewed = true;
      recordReview(word, review.rating, {
        hint: review.hint,
        inputTimeSeconds: review.inputTimeSeconds,
      });
    },
    [words, getAttemptState, recordReview],
  );

  const handleHintReveal = useCallback(
    (word: string) => {
      getAttemptState(word).hintUsed = true;
    },
    [getAttemptState],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const allCorrect =
      randomWords.length > 0 && randomWords.every(([word]) => words.getUserInput(word) === word);
    if (!allCorrect) {
      return;
    }

    refreshWords();
  };

  if (loading) {
    return (
      <PageContainer>
        <LoadingState label={t("common.loading")} />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("common.error")}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
            {t("addWord.title")}
          </Button>
        </Empty>
      </PageContainer>
    );
  }

  if (words.wordCount === 0) {
    return (
      <PageContainer>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("words.emptyLibraryTitle")}</EmptyTitle>
            <EmptyDescription>{t("words.emptyLibraryDescription")}</EmptyDescription>
          </EmptyHeader>
          <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
            {t("addWord.title")}
          </Button>
        </Empty>
      </PageContainer>
    );
  }

  if (roundInitialized && randomWords.length === 0) {
    return (
      <PageContainer>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("words.allReviewedTitle")}</EmptyTitle>
            <EmptyDescription>{t("words.allReviewedDescription")}</EmptyDescription>
          </EmptyHeader>
          <Button render={<Link href="/home" />} nativeButton={false} variant="outline">
            {t("practiceHub.back")}
          </Button>
        </Empty>
      </PageContainer>
    );
  }

  return (
    isClient && (
      <PageContainer>
        <PageHeader
          className="mb-6"
          title={t("practiceHub.words.title")}
          description={t("practiceHub.words.description")}
          actions={
            <>
              <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
                {t("addWord.title")}
              </Button>
              <Button render={<Link href="/home" />} nativeButton={false} variant="ghost">
                {t("practiceHub.back")}
              </Button>
            </>
          }
        />
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <ul className="divide-y">
            {randomWords.map(([word, translation]) => (
              <WordRow
                key={word}
                word={word}
                translation={translation}
                words={words}
                onInputChange={handleInputChange}
                onHintReveal={handleHintReveal}
                inputRefs={inputRefs}
                t={t}
              />
            ))}
          </ul>
          <div className="flex justify-end">
            <SubmitButton randomWords={randomWords} words={words} label={t("home.refresh")} />
          </div>
        </form>
      </PageContainer>
    )
  );
});

export default WordsPractice;
