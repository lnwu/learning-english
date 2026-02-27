"use client";

import { Input, Button, MasteryBar, SyncIndicator } from "@/components/ui";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useFirestoreWords, useLocale, toast } from "@/hooks";

const Home = observer(() => {
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
    if (!loading && words.allWords.size > 0 && randomWords.length === 0) {
      setRandomWords(words.getRandomWords());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, words.allWords.size, randomWords.length]);

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

  const parseTranslation = (translation: string) => {
    const segments = translation
      .split("\n")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return { englishDefinition: "", chineseTranslation: "" };
    }

    if (segments.length === 1) {
      const single = segments[0];
      const hasChinese = /[\u4e00-\u9fff]/.test(single);
      return hasChinese ? { englishDefinition: "", chineseTranslation: single } : { englishDefinition: single, chineseTranslation: "" };
    }

    return {
      englishDefinition: segments[0],
      chineseTranslation: segments.slice(1).join("\n"),
    };
  };

  const startEditingTranslation = (word: string, englishDefinition: string, chineseTranslation: string) => {
    setEditingWord(word);
    setEditingValue(chineseTranslation);
    editSessionRef.current = {
      word,
      originalChinese: chineseTranslation,
      englishDefinition,
      committed: false,
    };
  };

  const cancelEditingTranslation = () => {
    setEditingWord(null);
    setEditingValue("");
    editSessionRef.current = {
      word: null,
      originalChinese: "",
      englishDefinition: "",
      committed: false,
    };
  };

  const commitEditingTranslation = async () => {
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
  };

  const isCorrect = () => {
    return randomWords.length > 0 && randomWords.every(([word]) => words.userInputs.get(word) === word);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCorrect()) {
      return;
    }

    refreshWords();
  };

  const handleHintReveal = (word: string) => {
    // Only record incorrect attempt once per word per session
    if (!incorrectRecordedRef.current.has(word)) {
      incorrectRecordedRef.current.add(word);
      recordIncorrectAttempt(word);
    }
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
          <Link href="/add-word">
            <Button>{t("addWord.title")}</Button>
          </Link>
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
              {randomWords.map(([word, translation]) => {
                const inputValue = words.userInputs.get(word) || "";
                const { englishDefinition, chineseTranslation } = parseTranslation(translation);
                const isEditingTranslation = editingWord === word;

                return (
                  <li key={word} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
                    <div className="max-w-xs w-full text-right justify-self-end">
                      {isEditingTranslation ? (
                        <Input
                          className="w-full text-right"
                          type="text"
                          value={editingValue}
                          autoFocus
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => {
                            commitEditingTranslation();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (e.nativeEvent.isComposing) {
                                return;
                              }
                              e.preventDefault();
                              commitEditingTranslation();
                            }

                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEditingTranslation();
                            }
                          }}
                        />
                      ) : (
                        <div
                          className={`h-9 px-3 py-1 flex items-center justify-end whitespace-pre-line ${chineseTranslation ? "font-semibold" : "text-gray-400 italic"} cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:rounded`}
                          onDoubleClick={() => startEditingTranslation(word, englishDefinition, chineseTranslation)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              startEditingTranslation(word, englishDefinition, chineseTranslation);
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
                        onChange={(e) => {
                          const value = e.target.value.toLowerCase();

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
                              const endTime = Date.now();
                              const inputTimeSeconds = (endTime - startTime) / 1000;

                              // Record correct attempt with input time
                              recordCorrectAttempt(word, inputTimeSeconds);

                              timerStartRef.current.delete(word);
                            }
                          }
                        }}
                        value={inputValue}
                      />
                      <span
                        tabIndex={inputValue === word ? -1 : 0}
                        title={word}
                        className={`${inputValue === word ? "" : "cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:rounded"} px-1 relative group`}
                        onMouseEnter={() => {
                          if (inputValue !== word) {
                            handleHintReveal(word);
                          }
                        }}
                        onFocus={() => {
                          if (inputValue !== word) {
                            handleHintReveal(word);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && inputValue !== word) {
                            e.preventDefault();
                            const utterance = new SpeechSynthesisUtterance(word);
                            utterance.lang = "en-US";
                            speechSynthesis.speak(utterance);
                          }
                        }}
                      >
                        {inputValue === word ? "✅" : "❌"}
                        {inputValue !== word && <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">{word}</div>}
                      </span>
                      <MasteryBar score={words.getMasteryScore(word)} />
                    </div>
                    {englishDefinition && <div className="max-w-xs w-full text-right text-sm text-gray-500 whitespace-pre-line justify-self-end">{englishDefinition}</div>}
                    {englishDefinition && <div />}
                  </li>
                );
              })}
            </ul>
            <div className="flex space-x-2 justify-end">
              <Button type="submit" disabled={!isCorrect()}>
                {t("home.refresh")}
              </Button>
              <Link href="/add-word">
                <Button type="button">{t("addWord.title")}</Button>
              </Link>
            </div>
          </form>
        </main>
      </>
    )
  );
});

export default Home;
