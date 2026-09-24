import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { commitInChunks } from "@/lib/chunkedCommit";
import { getDb } from "@/lib/firebase";
import { newWordDocFields } from "@/lib/wordDoc";
import type { WordSense } from "@/lib/wordSenses";

const WORD_BATCH_LIMIT = 500;

export interface WordDocSnapshot {
  id: string;
  data: () => DocumentData;
}

export type WordOperation =
  | { type: "update"; wordId: string; fields: Record<string, unknown> }
  | { type: "delete"; wordId: string }
  | { type: "rename"; wordId: string; word: string };

export interface WordsRepo {
  readonly userId: string;
  readonly batchLimit: number;
  subscribeWords(handlers: {
    onDocs: (docs: WordDocSnapshot[]) => void;
    onError: (error: unknown) => void;
  }): () => void;
  addWord(word: string, senses: WordSense[]): Promise<void>;
  deleteWord(wordId: string): Promise<void>;
  commitWordOperations(operations: WordOperation[]): Promise<void>;
  loadPracticeTime(): Promise<Map<string, number>>;
  addPracticeTime(dateId: string, seconds: number): Promise<void>;
}

export const createWordsRepo = (userId: string): WordsRepo => {
  const db = getDb();
  const wordsCollection = () => collection(db, "users", userId, "words");
  const wordDoc = (wordId: string) => doc(db, "users", userId, "words", wordId);

  return {
    userId,
    batchLimit: WORD_BATCH_LIMIT,

    subscribeWords({ onDocs, onError }) {
      return onSnapshot(
        wordsCollection(),
        (snapshot) =>
          onDocs(
            snapshot.docs.map((item) => ({
              id: item.id,
              data: () => item.data(),
            }))
          ),
        onError
      );
    },

    async addWord(word, senses) {
      await addDoc(wordsCollection(), newWordDocFields(word, senses));
    },

    async deleteWord(wordId) {
      await deleteDoc(wordDoc(wordId));
    },

    async commitWordOperations(operations) {
      await commitInChunks({
        items: operations,
        chunkSize: WORD_BATCH_LIMIT,
        commitChunk: async (chunk) => {
          const batch = writeBatch(db);
          chunk.forEach((operation) => {
            if (operation.type === "delete") {
              batch.delete(wordDoc(operation.wordId));
              return;
            }
            if (operation.type === "rename") {
              batch.update(wordDoc(operation.wordId), { word: operation.word });
              return;
            }
            batch.update(wordDoc(operation.wordId), operation.fields);
          });
          await batch.commit();
        },
      });
    },

    async loadPracticeTime() {
      const snapshot = await getDocs(
        collection(db, "users", userId, "practiceTime")
      );
      return new Map(
        snapshot.docs.map((item) => [item.id, Number(item.data().seconds) || 0])
      );
    },

    async addPracticeTime(dateId, seconds) {
      await setDoc(
        doc(db, "users", userId, "practiceTime", dateId),
        { seconds: increment(seconds) },
        { merge: true }
      );
    },
  };
};
