import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const migrateLocalStorageToFirestore = async (userId: string) => {
  try {
    // Get data from localStorage
    const storedWords = localStorage.getItem("words");
    if (!storedWords) {
      console.log("No words to migrate");
      return { success: true, count: 0 };
    }

    const words: [string, string][] = JSON.parse(storedWords);
    const wordsCollection = collection(db, "users", userId, "words");

    // Upload each word to Firestore
    let migratedCount = 0;
    for (const [word, translation] of words) {
      await addDoc(wordsCollection, {
        word,
        translation,
        createdAt: new Date(),
      });
      migratedCount++;
    }

    console.log(`Successfully migrated ${migratedCount} words`);

    return { success: true, count: migratedCount };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, count: 0, error };
  }
};
