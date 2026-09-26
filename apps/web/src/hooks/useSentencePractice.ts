"use client";

import { useCallback, useState } from "react";
import { useFirestoreWords, useSyncStatus } from "@/hooks/useFirestoreWords";
import { postJson } from "@/lib/apiClient";
import { tNow } from "@/lib/i18n";
import {
  MIN_SENTENCE_WORDS,
  SENTENCE_WORD_POOL_SIZE,
  pickSentenceWords,
} from "@/lib/sentenceWords";

export interface SentenceQuestion {
  chinese: string;
  english: string;
  words: string[];
}

export interface SentenceFeedback {
  correct: boolean;
  score: number;
  feedback: string;
  corrected: string;
  issues: string[];
  usedWords: string[];
}

export const useSentencePractice = () => {
  const firestore = useFirestoreWords();
  const { words } = firestore;
  const { syncing, pendingCount } = useSyncStatus();

  const [question, setQuestion] = useState<SentenceQuestion | null>(null);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficientWords, setInsufficientWords] = useState(false);

  const pickWords = useCallback(
    () =>
      pickSentenceWords(words.knownWords(), {
        count: SENTENCE_WORD_POOL_SIZE,
        rng: Math.random,
      }),
    [words],
  );

  const generate = useCallback(async () => {
    setError(null);
    setInsufficientWords(false);
    setFeedback(null);
    setQuestion(null);

    const candidateWords = pickWords();
    if (candidateWords.length < MIN_SENTENCE_WORDS) {
      setInsufficientWords(true);
      return;
    }

    setGenerating(true);
    try {
      const result = await postJson<SentenceQuestion>(
        "/api/sentence/generate",
        {
          words: candidateWords.map((word) => ({
            word,
            translation: words.getTranslation(word) ?? "",
          })),
        },
        tNow("sentence.generateFailed"),
      );
      setQuestion(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : tNow("sentence.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }, [pickWords, words]);

  const check = useCallback(
    async (userAnswer: string) => {
      if (!question) return null;

      setError(null);
      setChecking(true);
      try {
        const result = await postJson<SentenceFeedback>(
          "/api/sentence/check",
          {
            chinese: question.chinese,
            words: question.words,
            reference: question.english,
            userAnswer,
          },
          tNow("sentence.checkFailed"),
        );
        setFeedback(result);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : tNow("sentence.checkFailed"));
        return null;
      } finally {
        setChecking(false);
      }
    },
    [question],
  );

  return {
    words,
    loading: firestore.loading,
    loadError: firestore.error,
    question,
    feedback,
    generating,
    checking,
    error,
    insufficientWords,
    generate,
    check,
    syncing,
    pendingCount,
    syncToFirestore: firestore.syncToFirestore,
  };
};
