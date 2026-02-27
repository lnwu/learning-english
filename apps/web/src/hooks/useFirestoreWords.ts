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
import { db, ensureFirebaseAuth } from "@/lib/firebase";
import { useSession } from "next-auth/react";
import { makeAutoObservable } from "mobx";
import { SyncQueueManager } from "@/lib/syncQueue";
import {
  migrateLocalDataToFirestore,
  hasPendingMigration,
} from "@/lib/migrateLocalData";
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
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const setupFirestore = async () => {
      if (!session?.user?.email) {
        setLoading(false);
        return;
      }

      try {
        await ensureFirebaseAuth(session.user.email);

        const userId = session.user.email;
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
  }, [session?.user?.email]);

  const addWord = async (word: string, translation: string) => {
    if (!session?.user?.email) {
      throw new Error("User not authenticated");
    }

    try {
      await ensureFirebaseAuth(session.user.email);

      const userId = session.user.email;
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
    if (!session?.user?.email) {
      throw new Error("User not authenticated");
    }

    const userId = session.user.email;
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
    if (!session?.user?.email) {
      throw new Error("User not authenticated");
    }

    const wordId = words.getWordId(word);
    if (!wordId) {
      throw new Error("Word not found");
    }

    try {
      await ensureFirebaseAuth(session.user.email);

      const userId = session.user.email;
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
    if (!session?.user?.email) {
      throw new Error("User not authenticated");
    }

    const userId = session.user.email;
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

  // Record a correct attempt with input time
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

  // Record an incorrect attempt (hint revealed)
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

  // Batch sync to Firestore
  const syncToFirestore = async () => {
    if (!session?.user?.email) {
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
      await ensureFirebaseAuth(session.user.email);
      const userId = session.user.email;

      // Group by wordId to batch updates
      const updates: Map<
        string,
        { correctCount: number; totalAttempts: number; inputTimes: number[] }
      > = new Map();

      queue.forEach((item) => {
        // Use the latest data for each word
        updates.set(item.wordId, item.data);
      });

      // Batch update to Firestore
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

  // Periodic sync
  useEffect(() => {
    if (!session?.user?.email) return;

    const doSync = () => syncToFirestore();

    // Initialize: show pending count
    setPendingCount(SyncQueueManager.getUniqueWordCount());

    // Check for pending migration data
    if (hasPendingMigration() && words.wordData.size > 0) {
      console.log("Found pending migration data, migrating...");
      const wordIds = new Map<string, string>();
      words.wordData.forEach((data, word) => {
        wordIds.set(word, data.id);
      });
      migrateLocalDataToFirestore(session.user.email, wordIds).then(
        (result) => {
          console.log("Migration result:", result);
          if (result.success) {
            console.log(`Migrated ${result.migratedCount} items`);
          } else {
            console.error("Migration errors:", result.errors);
          }
        }
      );
    }

    // Set timer: sync every 30 seconds
    const SYNC_INTERVAL = 30 * 1000;

    syncTimerRef.current = setInterval(doSync, SYNC_INTERVAL);

    // Sync immediately on page load
    doSync();

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // Sync on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && session?.user?.email) {
        syncToFirestore();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // Sync on network restore
  useEffect(() => {
    const handleOnline = () => {
      if (session?.user?.email) {
        console.log("Network restored, syncing...");
        syncToFirestore();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // Sync before page unload
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

  // Reset all practice records
  const resetPracticeRecords = async () => {
    if (!session?.user?.email) {
      throw new Error("User not authenticated");
    }

    try {
      await ensureFirebaseAuth(session.user.email);
      const userId = session.user.email;

      // Reset local state
      words.wordData.forEach((data) => {
        data.correctCount = 0;
        data.totalAttempts = 0;
        data.inputTimes = [];
        data.lastPracticedAt = null;
      });

      // Update all words in Firestore
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

      // Clear sync queue
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
