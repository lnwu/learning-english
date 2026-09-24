import type { DocumentData } from "firebase/firestore";
import { getLocalPracticeDate } from "@/lib/practiceDate";
import { encodeSenses, type WordSense } from "@/lib/wordSenses";
import type { SyncableWordData, WordData } from "@/lib/wordsStore";

export const translationFields = (senses: WordSense[]) => ({
  translation: encodeSenses(senses),
});

export const newWordDocFields = (word: string, senses: WordSense[]) => ({
  word,
  ...translationFields(senses),
  correctCount: 0,
  totalAttempts: 0,
  inputTimes: [],
  lastPracticedAt: null,
  correctPracticeDates: [],
  attemptHistory: [],
  createdAt: new Date(),
});

export const practiceFields = (
  data: Readonly<WordData>
): SyncableWordData => ({
  correctCount: data.correctCount,
  totalAttempts: data.totalAttempts,
  inputTimes: data.inputTimes,
  correctPracticeDates: data.correctPracticeDates,
  attemptHistory: data.attemptHistory,
});

export const attemptUpdateFields = (
  data: SyncableWordData,
  lastPracticedAt: number
) => ({
  correctCount: data.correctCount,
  totalAttempts: data.totalAttempts,
  inputTimes: data.inputTimes,
  ...(data.correctPracticeDates !== undefined && {
    correctPracticeDates: data.correctPracticeDates,
  }),
  ...(data.attemptHistory !== undefined && {
    attemptHistory: data.attemptHistory,
  }),
  lastPracticedAt: new Date(lastPracticedAt),
});

export const resetPracticeFields = () => ({
  correctCount: 0,
  totalAttempts: 0,
  inputTimes: [],
  lastPracticedAt: null,
  correctPracticeDates: [],
  attemptHistory: [],
});

export const parseWordDoc = (id: string, data: DocumentData): WordData => {
  const inputTimes = data.inputTimes ?? [];
  const lastPracticedAt = data.lastPracticedAt?.toDate() ?? null;

  return {
    word: data.word,
    translation: data.translation,
    correctCount: data.correctCount ?? 0,
    totalAttempts: data.totalAttempts ?? 0,
    inputTimes,
    lastPracticedAt,
    correctPracticeDates: (data.correctPracticeDates ?? []).map(
      getLocalPracticeDate
    ),
    attemptHistory: (data.attemptHistory ?? []).map(Boolean),
    createdAt: data.createdAt?.toDate() ?? new Date(),
    id,
  };
};
