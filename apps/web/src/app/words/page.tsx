"use client";

import { Input, Button, MasteryBar, SyncIndicator } from "@/components/ui";
import { useCallback, useEffect, useState, useRef, type FormEvent, type RefObject } from "react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { parseTranslation } from "@/lib/parseTranslation";
import type { Words } from "@/hooks/useFirestoreWords";
import type { TranslationKey } from "@/lib/i18n";

interface WordRowProps {
  word: string;
  translation: string;
  words: Words;
  isEditing: boolean;
  editingValue: string;
  onEditingValueChange: (value: string) => void;
  onStartEdit: (word: string, englishDefinition: string, chineseTranslation: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onInputChange: (word: string, value: string) => void;
  onHintReveal: (word: string) => void;
  inputRefs: RefObject<Map<string, HTMLInputElement>>;
  t: (key: TranslationKey) => string;
}

const WordRow = observer(({ word, translation, words, isEditing, editingValue, onEditingValueChange, onStartEdit, onCommitEdit, onCancelEdit, onInputChange, onHintReveal, inputRefs, t }: WordRowProps) => {
  const inputValue = words.userInputs.get(word) || "";
  const { englishDefinition, chineseTranslation } = parseTranslation(translation);

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
      <div className="max-w-xs w-full text-right justify-self-end">
        {isEditing ? (
          <Input
            className="w-full text-right"
            type="text"
            value={editingValue}
            autoFocus
            onChange={(e) => onEditingValueChange(e.target.value)}
            onBlur={() => {
              onCommitEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.nativeEvent.isComposing) {
                  return;
                }
                e.preventDefault();
                onCommitEdit();
              }

              if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
          />
        ) : (
          <div
            className={`h-9 px-3 py-1 flex items-center justify-end whitespace-pre-line ${chineseTranslation ? "font-semibold" : "text-gray-400 italic"} cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:rounded`}
            onDoubleClick={() => onStartEdit(word, englishDefinition, chineseTranslation)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onStartEdit(word, englishDefinition, chineseTranslation);
              }
            }}
            title={t("home.editTranslationHint")}
          >
            {chineseTranslation || t("home.addChineseTranslation")}
          </div>
        )}
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
      {englishDefinition && <div className="max-w-xs w-full text-right text-sm text-gray-500 whitespace-pre-line justify-self-end">{englishDefinition}</div>}
      {englishDefinition && <div />}
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
  const { words, recordCorrectAttempt, recordIncorrectAttempt, syncToFirestore, syncing, pendingCount, loading, error, updateTranslation } = useFirestoreWords();
  const { t } = useLocale();
  const [isClient, setIsClient] = useState(false);
  const [shouldFocusFirst, setShouldFocusFirst] = useState(false);
  const [randomWords, setRandomWords] = useState<[string, string][]>([]);
  const [editingWord, setEditingWord] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const incorrectRecordedRef = useRef<Set<string>>(new Set());
  const timerStartRef = useRef<Map<string, number>>(new Map());
  const editSessionRef = useRef<{
    word: string | null;
    originalChinese: string;
    englishDefinition: string;
    committed: boolean;
  }>({
    word: null,
    originalChinese: "",
    englishDefinition: "",
    committed: false,
  });

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

  const startEditingTranslation = useCallback((word: string, englishDefinition: string, chineseTranslation: string) => {
    setEditingWord(word);
    setEditingValue(chineseTranslation);
    editSessionRef.current = {
      word,
      originalChinese: chineseTranslation,
      englishDefinition,
      committed: false,
    };
  }, []);

  const cancelEditingTranslation = useCallback(() => {
    setEditingWord(null);
    setEditingValue("");
    editSessionRef.current = {
      word: null,
      originalChinese: "",
      englishDefinition: "",
      committed: false,
    };
  }, []);

  const commitEditingTranslation = useCallback(async () => {
    const session = editSessionRef.current;
    if (!session.word || session.committed) {
      return;
    }

    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast({
        title: t("home.translationEmpty"),
        variant: "destructive",
      });
      return;
    }

    if (trimmed === session.originalChinese) {
      cancelEditingTranslation();
      return;
    }

    session.committed = true;

    try {
      const newTranslation = session.englishDefinition ? `${session.englishDefinition}\n${trimmed}` : trimmed;
      await updateTranslation(session.word, newTranslation);
      setRandomWords((prev) => prev.map(([itemWord, itemTranslation]) => (itemWord === session.word ? [itemWord, newTranslation] : [itemWord, itemTranslation])));
      toast({
        title: t("home.translationUpdated"),
        variant: "success",
      });
      cancelEditingTranslation();
    } catch (err) {
      console.error("Failed to update translation:", err);
      session.committed = false;
      toast({
        title: t("home.translationUpdateFailed"),
        variant: "destructive",
      });
    }
  }, [editingValue, t, updateTranslation, cancelEditingTranslation]);

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
          <Button asChild>
            <Link href="/add-word">{t("addWord.title")}</Link>
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
            <ul className="space-y-2">
              {randomWords.map(([word, translation]) => (
                <WordRow
                  key={word}
                  word={word}
                  translation={translation}
                  words={words}
                  isEditing={editingWord === word}
                  editingValue={editingWord === word ? editingValue : ""}
                  onEditingValueChange={setEditingValue}
                  onStartEdit={startEditingTranslation}
                  onCommitEdit={commitEditingTranslation}
                  onCancelEdit={cancelEditingTranslation}
                  onInputChange={handleInputChange}
                  onHintReveal={handleHintReveal}
                  inputRefs={inputRefs}
                  t={t}
                />
              ))}
            </ul>
            <div className="flex space-x-2 justify-end">
              <SubmitButton randomWords={randomWords} words={words} label={t("home.refresh")} />
              <Button asChild type="button" variant="outline">
                <Link href="/add-word">{t("addWord.title")}</Link>
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/home">{t("practiceHub.back")}</Link>
              </Button>
            </div>
          </form>
        </main>
      </>
    )
  );
});

export default WordsPractice;
