"use client";

import { useEffect, useState, useRef } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { makeAutoObservable } from "mobx";
import { SyncQueueManager } from "@/lib/syncQueue";
import {
  calculateMasteryScore,
  calculatePriority,
  getMasteryLevelIndex,
  type MasteryResult,
} from "@/lib/masteryCalculator";

interface WordData {
  word: string;
  translation: string;
  correctCount: number;
  totalAttempts: number;
  inputTimes: number[];
  lastPracticedAt: Date | null;
  createdAt: Date;
  id: string;
}

class Words {
  static MAX_RANDOM_WORDS = 5;
  static MAX_INPUT_TIMES = 20; // Keep last 20 input times

  wordData: Map<string, WordData> = new Map();
  userInputs: Map<string, string> = new Map();

  constructor() {
    makeAutoObservable(this);
  }

  setWords(words: WordData[]) {
    this.wordData = new Map(words.map((w) => [w.word, w]));
  }

  addWord(word: string, translation: string, id: string) {
    this.wordData.set(word, {
      word,
      translation,
      correctCount: 0,
      totalAttempts: 0,
      inputTimes: [],
      lastPracticedAt: null,
      createdAt: new Date(),
      id,
    });
  }

  deleteWord(word: string) {
    this.wordData.delete(word);
  }

  removeAllWords() {
    this.wordData.clear();
  }

  // Record a correct attempt with input time
  recordCorrectAttempt(word: string, inputTimeSeconds: number) {
    const data = this.wordData.get(word);
    if (!data) return;

    data.totalAttempts += 1;
    data.correctCount += 1;
    data.inputTimes.push(inputTimeSeconds);

    // Keep only last N input times
    if (data.inputTimes.length > Words.MAX_INPUT_TIMES) {
      data.inputTimes = data.inputTimes.slice(-Words.MAX_INPUT_TIMES);
    }

    data.lastPracticedAt = new Date();
  }

  // Record an incorrect attempt (hint revealed)
  recordIncorrectAttempt(word: string) {
    const data = this.wordData.get(word);
    if (!data) return;

    data.totalAttempts += 1;
    data.lastPracticedAt = new Date();
  }

  // Get mastery score for a word (0-100)
  getMasteryScore(word: string): number {
    const data = this.wordData.get(word);
    if (!data) return 0;
    return calculateMasteryScore(data).score;
  }

  // Get detailed mastery result for a word
  getMasteryResult(word: string): MasteryResult | null {
    const data = this.wordData.get(word);
    if (!data) return null;
    return calculateMasteryScore(data);
  }

  // Get mastery level index (0-4) for UI display
  getMasteryLevelIndex(word: string): number {
    return getMasteryLevelIndex(this.getMasteryScore(word));
  }

  // Get input times for a word
  getInputTimes(word: string): number[] {
    return this.wordData.get(word)?.inputTimes ?? [];
  }

  // Get average input time for a word
  getAverageInputTime(word: string): number | null {
    const times = this.getInputTimes(word);
    if (times.length === 0) return null;
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  // Get overall average input time across all words
  getOverallAverageInputTime(): number | null {
    const allTimes: number[] = [];
    this.wordData.forEach((data) => {
      allTimes.push(...data.inputTimes);
    });
    if (allTimes.length === 0) return null;
    return allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length;
  }

  // Get word length category: 0 (≤5), 1 (6-10), 2 (>10)
  getWordLengthCategory(word: string): number {
    const length = word.length;
    if (length <= 5) return 0;
    if (length <= 10) return 1;
    return 2;
  }

  // Get average input time for words in the same length category
  getAverageTimeByLengthCategory(category: number): number | null {
    const categoryTimes: number[] = [];

    this.wordData.forEach((data, word) => {
      if (this.getWordLengthCategory(word) === category) {
        categoryTimes.push(...data.inputTimes);
      }
    });

    if (categoryTimes.length === 0) return null;
    return (
      categoryTimes.reduce((sum, time) => sum + time, 0) / categoryTimes.length
    );
  }

  // Get total attempts for a word
  getTotalAttempts(word: string): number {
    return this.wordData.get(word)?.totalAttempts ?? 0;
  }

  // Get correct count for a word
  getCorrectCount(word: string): number {
    return this.wordData.get(word)?.correctCount ?? 0;
  }

  // Get word data for syncing
  getWordData(word: string): WordData | undefined {
    return this.wordData.get(word);
  }

  getWordId(word: string): string | undefined {
    return this.wordData.get(word)?.id;
  }

  getTranslation(word: string): string | undefined {
    return this.wordData.get(word)?.translation;
  }

  updateTranslation(word: string, translation: string) {
    const data = this.wordData.get(word);
    if (!data) return;
    data.translation = translation;
  }

  setUserInput(word: string, value: string) {
    this.userInputs.set(word, value);
  }

  get correct() {
    const randomWords = this.getRandomWords();
    return (
      this.userInputs.size === randomWords.length &&
      Array.from(this.userInputs.entries()).every(
        ([word, value]) => word === value
      )
    );
  }

  get allWords(): Map<string, string> {
    const result = new Map<string, string>();
    this.wordData.forEach((data, word) => {
      result.set(word, data.translation);
    });
    return result;
  }

  // Get random words weighted by practice priority
  getRandomWords(max: number = Words.MAX_RANDOM_WORDS): [string, string][] {
    const wordEntries = Array.from(this.wordData.entries());
    if (wordEntries.length === 0) {
      return [];
    }

    // Calculate priority for each word
    const wordsWithPriority = wordEntries.map(([word, data]) => {
      const masteryScore = calculateMasteryScore(data).score;
      const priority = calculatePriority(
        masteryScore,
        data.lastPracticedAt,
        data.totalAttempts
      );
      return { word, translation: data.translation, priority };
    });

    const selected: [string, string][] = [];
    const available = [...wordsWithPriority];

    for (let i = 0; i < Math.min(max, wordEntries.length); i++) {
      if (available.length === 0) break;

      // Calculate total priority
      const totalPriority = available.reduce(
        (sum, item) => sum + item.priority,
        0
      );

      // Random selection based on priority
      let random = Math.random() * totalPriority;
      let selectedIndex = 0;

      for (let j = 0; j < available.length; j++) {
        random -= available[j].priority;
        if (random <= 0) {
          selectedIndex = j;
          break;
        }
      }

      const selectedItem = available[selectedIndex];
      selected.push([selectedItem.word, selectedItem.translation]);
      available.splice(selectedIndex, 1);
    }

    return selected;
  }
}

const words = new Words();

export const useFirestoreWords = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const setupFirestore = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userId = user.uid;
        const wordsCollection = collection(db, "users", userId, "words");

        const unsubscribe = onSnapshot(
          wordsCollection,
          (snapshot) => {
            const wordsData: WordData[] = snapshot.docs.map((doc) => {
              const data = doc.data();
              // Migration: convert old frequency-based data to new format
              const inputTimes = data.inputTimes ?? [];
              const hasOldFormat = data.frequency !== undefined && data.correctCount === undefined;
              
              return {
                word: data.word,
                translation: data.translation,
                // Migration: estimate correctCount from inputTimes length if old format
                correctCount: hasOldFormat ? inputTimes.length : (data.correctCount ?? 0),
                totalAttempts: hasOldFormat ? inputTimes.length : (data.totalAttempts ?? 0),
                inputTimes,
                lastPracticedAt: data.lastPracticedAt?.toDate() ?? null,
                createdAt: data.createdAt?.toDate() ?? new Date(),
                id: doc.id,
              };
            });
            words.setWords(wordsData);
            
            // Clean up stale sync queue items
            // If Firestore data matches or exceeds queue data, remove from queue
            const queue = SyncQueueManager.getQueue();
            if (queue.length > 0) {
              const staleIds: string[] = [];
              queue.forEach((item) => {
                const firestoreWord = wordsData.find((w) => w.id === item.wordId);
                if (firestoreWord) {
                  // If Firestore has same or newer data, this queue item is stale
                  if (
                    firestoreWord.totalAttempts >= item.data.totalAttempts &&
                    firestoreWord.correctCount >= item.data.correctCount
                  ) {
                    staleIds.push(item.id);
                  }
                }
              });
              
              if (staleIds.length > 0) {
                const updatedQueue = queue.filter((item) => !staleIds.includes(item.id));
                SyncQueueManager.saveQueue(updatedQueue);
                setPendingCount(SyncQueueManager.getUniqueWordCount());
              }
            }
            
            setLoading(false);
            setError(null);
          },
          (err) => {
            console.error("Firestore error:", err);
            setError("Failed to load words from cloud");
            setLoading(false);
          }
        );

        return unsubscribe;
      } catch (err) {
        console.error("Firebase Auth error:", err);
        setError("Failed to authenticate with Firebase");
        setLoading(false);
      }
    };

    setupFirestore();
  }, [user?.uid]);

  const addWord = async (word: string, translation: string) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    try {
      const userId = user.uid;
      const wordsCollection = collection(db, "users", userId, "words");

      await addDoc(wordsCollection, {
        word,
        translation,
        correctCount: 0,
        totalAttempts: 0,
        inputTimes: [],
        lastPracticedAt: null,
        createdAt: new Date(),
      });
    } catch (err) {
      console.error("Failed to add word:", err);
      throw new Error(`Failed to add word to cloud: ${err}`);
    }
  };

  const deleteWord = async (word: string) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    const userId = user.uid;
    const wordsCollection = collection(db, "users", userId, "words");

    try {
      const q = query(wordsCollection, where("word", "==", word));
      const querySnapshot = await getDocs(q);

      const deletePromises = querySnapshot.docs.map((document) =>
        deleteDoc(doc(db, "users", userId, "words", document.id))
      );
      await Promise.all(deletePromises);
    } catch (err) {
      console.error("Failed to delete word:", err);
      throw new Error("Failed to delete word from cloud");
    }
  };

  const updateTranslation = async (word: string, translation: string) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    const wordId = words.getWordId(word);
    if (!wordId) {
      throw new Error("Word not found");
    }

    try {
      const userId = user.uid;
      const wordDocRef = doc(db, "users", userId, "words", wordId);
      await updateDoc(wordDocRef, {
        translation,
      });

      words.updateTranslation(word, translation);
    } catch (err) {
      console.error("Failed to update translation:", err);
      throw new Error("Failed to update translation");
    }
  };

  const removeAllWords = async () => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    const userId = user.uid;
    const wordsCollection = collection(db, "users", userId, "words");

    try {
      const querySnapshot = await getDocs(wordsCollection);

      const deletePromises = querySnapshot.docs.map((document) =>
        deleteDoc(doc(db, "users", userId, "words", document.id))
      );

      await Promise.all(deletePromises);
    } catch (err) {
      console.error("Failed to remove all words:", err);
      throw new Error("Failed to remove words from cloud");
    }
  };

  const recordCorrectAttempt = (word: string, inputTimeSeconds: number) => {
    words.recordCorrectAttempt(word, inputTimeSeconds);

    const wordId = words.getWordId(word);
    const data = words.getWordData(word);
    if (wordId && data) {
      SyncQueueManager.addToQueue({
        type: "attempt",
        word,
        wordId,
        data: {
          correctCount: data.correctCount,
          totalAttempts: data.totalAttempts,
          inputTimes: data.inputTimes,
        },
      });
      setPendingCount(SyncQueueManager.getUniqueWordCount());
    }
  };

  const recordIncorrectAttempt = (word: string) => {
    words.recordIncorrectAttempt(word);

    const wordId = words.getWordId(word);
    const data = words.getWordData(word);
    if (wordId && data) {
      SyncQueueManager.addToQueue({
        type: "attempt",
        word,
        wordId,
        data: {
          correctCount: data.correctCount,
          totalAttempts: data.totalAttempts,
          inputTimes: data.inputTimes,
        },
      });
      setPendingCount(SyncQueueManager.getUniqueWordCount());
    }
  };

  const syncToFirestore = async () => {
    if (!user) {
      console.warn("User not authenticated, skipping sync");
      return;
    }

    const queue = SyncQueueManager.getQueue();
    if (queue.length === 0) {
      return;
    }

    setSyncing(true);
    console.log(`Syncing ${queue.length} items to Firestore...`);

    try {
      const userId = user.uid;

      const updates: Map<
        string,
        { correctCount: number; totalAttempts: number; inputTimes: number[] }
      > = new Map();

      queue.forEach((item) => {
        updates.set(item.wordId, item.data);
      });

      const updatePromises = Array.from(updates.entries()).map(
        async ([wordId, data]) => {
          const wordDocRef = doc(db, "users", userId, "words", wordId);
          await updateDoc(wordDocRef, {
            correctCount: data.correctCount,
            totalAttempts: data.totalAttempts,
            inputTimes: data.inputTimes,
            lastPracticedAt: new Date(),
          });
        }
      );

      await Promise.all(updatePromises);

      SyncQueueManager.clearQueue();
      setPendingCount(0);

      console.log("Sync completed successfully");
    } catch (error) {
      console.error("Sync failed:", error);

      queue.forEach((item) => {
        SyncQueueManager.incrementRetry(item.id);
      });

      setPendingCount(SyncQueueManager.getUniqueWordCount());
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const doSync = () => syncToFirestore();

    setPendingCount(SyncQueueManager.getUniqueWordCount());

    const SYNC_INTERVAL = 30 * 1000;

    syncTimerRef.current = setInterval(doSync, SYNC_INTERVAL);

    doSync();

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user) {
        syncToFirestore();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    const handleOnline = () => {
      if (user) {
        console.log("Network restored, syncing...");
        syncToFirestore();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (SyncQueueManager.getQueueLength() > 0) {
        syncToFirestore();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetPracticeRecords = async () => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    try {
      const userId = user.uid;

      words.wordData.forEach((data) => {
        data.correctCount = 0;
        data.totalAttempts = 0;
        data.inputTimes = [];
        data.lastPracticedAt = null;
      });

      const updatePromises = Array.from(words.wordData.entries()).map(
        async ([, data]) => {
          const wordDocRef = doc(db, "users", userId, "words", data.id);
          await updateDoc(wordDocRef, {
            correctCount: 0,
            totalAttempts: 0,
            inputTimes: [],
            lastPracticedAt: null,
          });
        }
      );

      await Promise.all(updatePromises);

      SyncQueueManager.clearQueue();
      setPendingCount(0);

      console.log("Practice records reset successfully");
    } catch (err) {
      console.error("Failed to reset practice records:", err);
      throw new Error("Failed to reset practice records");
    }
  };

  return {
    words,
    addWord,
    deleteWord,
    updateTranslation,
    removeAllWords,
    recordCorrectAttempt,
    recordIncorrectAttempt,
    syncToFirestore,
    resetPracticeRecords,
    loading,
    error,
    syncing,
    pendingCount,
  };
};
