"use client";

import { useCallback, useRef, useState } from "react";
import { useFirestoreWords, useSyncStatus } from "@/hooks/useFirestoreWords";
import { postJson } from "@/lib/apiClient";
import { tNow } from "@/lib/i18n";
import {
  MIN_SENTENCE_WORDS,
  pickSentenceWords,
  pickWordCount,
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
  usedWords?: string[];
}

export const useSentencePractice = () => {
  const firestore = useFirestoreWords();
  const { words, recordCorrectAttempt, recordIncorrectAttempt } = firestore;
  const { syncing, pendingCount } = useSyncStatus();

  const [question, setQuestion] = useState<SentenceQuestion | null>(null);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficientWords, setInsufficientWords] = useState(false);
  const scoredQuestionRef = useRef<SentenceQuestion | null>(null);

  const pickWords = useCallback(() => {
    const count = pickWordCount(Math.random);
    const picked = pickSentenceWords(words.wordEntries(), {
      count,
      rng: Math.random,
    });
    if (picked.length >= MIN_SENTENCE_WORDS) {
      return picked;
    }
    return words.getRandomWords(count).map(([word]) => word);
  }, [words]);

  const generate = useCallback(async () => {
    setError(null);
    setInsufficientWords(false);
    setFeedback(null);
    setQuestion(null);
    scoredQuestionRef.current = null;

    const targetWords = pickWords();
    if (targetWords.length < MIN_SENTENCE_WORDS) {
      setInsufficientWords(true);
      return;
    }

    setGenerating(true);
    try {
      const result = await postJson<SentenceQuestion>(
        "/api/sentence/generate",
        {
          words: targetWords.map((word) => ({
            word,
            translation: words.getTranslation(word) ?? "",
          })),
        },
        tNow("sentence.generateFailed")
      );
      setQuestion(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tNow("sentence.generateFailed")
      );
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
          tNow("sentence.checkFailed")
        );
        setFeedback(result);

        const attemptedWords = result.usedWords ?? question.words;
        const shouldRecord = scoredQuestionRef.current !== question;
        if (shouldRecord) {
          scoredQuestionRef.current = question;
          attemptedWords.forEach((word) => {
            if (result.correct) {
              // 造句场景没有真实输入计时，不传 inputTimeSeconds，避免伪造时间抬高 speedScore
              recordCorrectAttempt(word);
            } else {
              recordIncorrectAttempt(word);
            }
          });
        }
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : tNow("sentence.checkFailed"));
        return null;
      } finally {
        setChecking(false);
      }
    },
    [question, recordCorrectAttempt, recordIncorrectAttempt]
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
