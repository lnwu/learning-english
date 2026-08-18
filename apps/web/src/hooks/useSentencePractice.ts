"use client";

import { useCallback, useState } from "react";
import { useFirestoreWords } from "@/hooks/useFirestoreWords";
import { auth } from "@/lib/firebase";

export interface SentenceQuestion {
  chinese: string;
  english: string;
  grammarPoint: string;
  words: string[];
}

export interface SentenceFeedback {
  correct: boolean;
  score: number;
  feedback: string;
  corrected: string;
  issues: string[];
}

const MIN_WORDS = 2;
const MAX_WORDS = 3;
const PRIORITIZED_MIN_ATTEMPTS = 3;

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error("用户未登录");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : "请求失败，请稍后重试";
    throw new Error(message);
  }
  return data as T;
}

export const useSentencePractice = () => {
  const firestore = useFirestoreWords();
  const { words, recordCorrectAttempt, recordIncorrectAttempt } = firestore;

  const [question, setQuestion] = useState<SentenceQuestion | null>(null);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickPrioritizedWords = useCallback(
    (count: number) => {
      const entries = Array.from(words.wordData.entries());
      if (entries.length === 0) return [];

      const practiced = entries.filter(([, data]) => data.totalAttempts >= PRIORITIZED_MIN_ATTEMPTS);
      const lessPracticed = entries.filter(([, data]) => data.totalAttempts < PRIORITIZED_MIN_ATTEMPTS);

      const shuffledPracticed = [...practiced].sort(() => Math.random() - 0.5);
      const prioritizedWords = shuffledPracticed.slice(0, count).map(([word]) => word);

      if (prioritizedWords.length >= count) {
        return prioritizedWords;
      }

      const remaining = count - prioritizedWords.length;
      const shuffledLessPracticed = [...lessPracticed].sort(() => Math.random() - 0.5);
      const fallbackWords = shuffledLessPracticed.slice(0, remaining).map(([word]) => word);

      return [...prioritizedWords, ...fallbackWords];
    },
    [words]
  );

  const pickWords = useCallback(() => {
    const count = Math.floor(Math.random() * (MAX_WORDS - MIN_WORDS + 1)) + MIN_WORDS;
    const prioritized = pickPrioritizedWords(count);
    if (prioritized.length >= MIN_WORDS) {
      return prioritized;
    }
    return words.getRandomWords(count).map(([word]) => word);
  }, [pickPrioritizedWords, words]);

  const generate = useCallback(async () => {
    setError(null);
    setFeedback(null);
    setQuestion(null);

    const targetWords = pickWords();
    if (targetWords.length < MIN_WORDS) {
      setError("insufficientWords");
      return;
    }

    setGenerating(true);
    try {
      const result = await postJson<SentenceQuestion>("/api/sentence/generate", {
        words: targetWords.map((word) => ({ word, translation: words.getTranslation(word) ?? "" })),
      });
      setQuestion(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败，请稍后重试");
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
        const result = await postJson<SentenceFeedback>("/api/sentence/check", {
          chinese: question.chinese,
          words: question.words,
          reference: question.english,
          userAnswer,
        });
        setFeedback(result);

        question.words.forEach((word) => {
          if (result.correct) {
            // 造句场景没有真实输入计时，不传 inputTimeSeconds，避免伪造时间抬高 speedScore
            recordCorrectAttempt(word);
          } else {
            recordIncorrectAttempt(word);
          }
        });
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "批改失败，请稍后重试");
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
    generate,
    check,
    syncing: firestore.syncing,
    pendingCount: firestore.pendingCount,
    syncToFirestore: firestore.syncToFirestore,
  };
};
