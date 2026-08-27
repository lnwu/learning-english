"use client";

import { Input, Button, MasteryBar, SyncIndicator } from "@/components/ui";
import { useCallback, useEffect, useState, useRef, type FormEvent, type RefObject } from "react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useFirestoreWords, useLocale } from "@/hooks";
import { parseTranslation } from "@/lib/parseTranslation";
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

const WordRow = observer(({ word, translation, words, onInputChange, onHintReveal, inputRefs, t }: WordRowProps) => {
  const inputValue = words.userInputs.get(word) || "";
  const { senses } = parseTranslation(translation);
  const hasSense = senses.some((sense) => sense.chinese);

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 border-b border-gray-100 py-3 first:pt-0 last:border-b-0">
      <div className="max-w-xs w-full justify-self-end text-left">
        <div
          className={`min-h-8 px-3 py-1 flex flex-col items-start justify-start whitespace-pre-line ${hasSense ? "font-semibold" : "text-gray-400 italic"}`}
        >
          {hasSense ? (
            senses.map((sense, index) => (
              <span key={index} className="flex flex-col">
                <span>{[sense.pos, sense.chinese].filter(Boolean).join(" ")}</span>
                {sense.english && <span className="text-sm font-normal text-gray-500">{sense.english}</span>}
              </span>
            ))
          ) : (
            t("home.noTranslation")
          )}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Input
          className="w-xs"
          type="text"
          id={word}
          ref={(el) => {
            if (el) {
              inputRefs.current.set(word, el);
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
          className={`${inputValue === word ? "" : "cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:rounded"} px-1 relative group disabled:cursor-default`}
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
          {inputValue === word ? "✅" : "❌"}
          {inputValue !== word && <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">{word}</div>}
        </button>
        <MasteryBar score={words.getMasteryScore(word)} />
      </div>
    </li>
  );
});

const SubmitButton = observer(({ randomWords, words, label }: { randomWords: [string, string][]; words: Words; label: string }) => {
  const allCorrect = randomWords.length > 0 && randomWords.every(([word]) => words.userInputs.get(word) === word);
  return (
    <Button type="submit" disabled={!allCorrect}>
      {label}
    </Button>
  );
});

const WordsPractice = observer(() => {
  const { words, recordCorrectAttempt, recordIncorrectAttempt, syncToFirestore, syncing, pendingCount, loading, error } = useFirestoreWords();
  const { t } = useLocale();
  const [isClient, setIsClient] = useState(false);
  const [shouldFocusFirst, setShouldFocusFirst] = useState(false);
  const [randomWords, setRandomWords] = useState<[string, string][]>([]);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const incorrectRecordedRef = useRef<Set<string>>(new Set());
  const timerStartRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize random words when words are loaded
  useEffect(() => {
    if (!loading && words.wordData.size > 0 && randomWords.length === 0) {
      setRandomWords(words.getRandomWords());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, words.wordData.size, randomWords.length]);

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
    words.userInputs.clear();
    incorrectRecordedRef.current.clear();
    timerStartRef.current.clear();
    setRandomWords(words.getRandomWords());
    setShouldFocusFirst(true);
  };

  const handleInputChange = useCallback((word: string, value: string) => {
    // Start timer on first character typed
    if (value.length === 1) {
      timerStartRef.current.set(word, Date.now());
    }

    // Clear timer if user clears input
    if (value.length === 0) {
      timerStartRef.current.delete(word);
    }

    words.setUserInput(word, value);

    if (value.length >= word.length && value !== word && !incorrectRecordedRef.current.has(word)) {
      incorrectRecordedRef.current.add(word);
      recordIncorrectAttempt(word);
    }

    // If word is now correct, record the attempt
    if (value === word) {
      const startTime = timerStartRef.current.get(word);

      if (startTime) {
        const inputTimeSeconds = (Date.now() - startTime) / 1000;
        recordCorrectAttempt(word, inputTimeSeconds);
        timerStartRef.current.delete(word);
      }
    }
  }, [words, recordCorrectAttempt, recordIncorrectAttempt]);

  const handleHintReveal = useCallback((word: string) => {
    // Only record incorrect attempt once per word per session
    if (!incorrectRecordedRef.current.has(word)) {
      incorrectRecordedRef.current.add(word);
      recordIncorrectAttempt(word);
    }
  }, [recordIncorrectAttempt]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const allCorrect = randomWords.length > 0 && randomWords.every(([word]) => words.userInputs.get(word) === word);
    if (!allCorrect) {
      return;
    }

    refreshWords();
  };

  if (loading) {
    return (
      <main>
        <div className="text-center">{t("common.loading")}</div>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <div className="text-center text-red-500">
          {t("common.error")}: {error}
        </div>
        <div className="text-center mt-4">
          <Button render={<Link href="/add-word" />} nativeButton={false}>
            {t("addWord.title")}
          </Button>
        </div>
      </main>
    );
  }

  return (
    isClient && (
      <>
        <SyncIndicator syncing={syncing} pendingCount={pendingCount} onManualSync={syncToFirestore} />
        <main>
          <form onSubmit={handleSubmit} className="flex flex-col space-y-2">
            <ul>
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
            <div className="flex space-x-2 justify-end">
              <SubmitButton randomWords={randomWords} words={words} label={t("home.refresh")} />
              <Button render={<Link href="/add-word" />} nativeButton={false} variant="outline">
                {t("addWord.title")}
              </Button>
              <Button render={<Link href="/home" />} nativeButton={false} variant="outline">
                {t("practiceHub.back")}
              </Button>
            </div>
          </form>
        </main>
      </>
    )
  );
});

export default WordsPractice;
