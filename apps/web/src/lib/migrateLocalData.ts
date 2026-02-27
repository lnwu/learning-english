import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface LocalStorageData {
  inputTimes: Map<string, number[]>;
  frequencies: Map<string, number>;
}

/**
 * 迁移本地临时数据到 Firestore
 * 处理冲突：将本地数据合并到远端，然后删除本地临时数据
 */
export const migrateLocalDataToFirestore = async (
  userId: string,
  wordIds: Map<string, string> // word -> Firestore document ID
): Promise<{ success: boolean; migratedCount: number; errors: string[] }> => {
  const errors: string[] = [];
  let migratedCount = 0;

  try {
    // 1. 收集所有本地临时数据
    const localData = collectLocalData();
    
    if (localData.inputTimes.size === 0 && localData.frequencies.size === 0) {
      console.log("No local data to migrate");
      return { success: true, migratedCount: 0, errors: [] };
    }

    console.log(`Found ${localData.inputTimes.size} words with inputTimes, ${localData.frequencies.size} words with frequencies`);

    // 2. 合并到 Firestore
    const migrationPromises: Promise<void>[] = [];

    // 迁移 inputTimes
    for (const [word, times] of localData.inputTimes.entries()) {
      const wordId = wordIds.get(word);
      if (!wordId) {
        errors.push(`Word ID not found for: ${word}`);
        continue;
      }

      if (times.length === 0) continue;

      const promise = (async () => {
        try {
          const wordDocRef = doc(db, "users", userId, "words", wordId);
          
          // 使用 arrayUnion 合并数据，避免覆盖远端已有数据
          await updateDoc(wordDocRef, {
            inputTimes: arrayUnion(...times)
          });
          
          console.log(`Migrated ${times.length} inputTimes for word: ${word}`);
          migratedCount++;
          
          // 迁移成功后删除本地临时数据
          localStorage.removeItem(`inputTimes_${word}`);
        } catch (error) {
          errors.push(`Failed to migrate inputTimes for ${word}: ${error}`);
        }
      })();

      migrationPromises.push(promise);
    }

    // 迁移 frequencies
    for (const [word, frequency] of localData.frequencies.entries()) {
      const wordId = wordIds.get(word);
      if (!wordId) {
        errors.push(`Word ID not found for: ${word}`);
        continue;
      }

      const promise = (async () => {
        try {
          const wordDocRef = doc(db, "users", userId, "words", wordId);
          
          // 频率直接覆盖（因为本地是最新的状态）
          await updateDoc(wordDocRef, {
            frequency
          });
          
          console.log(`Migrated frequency ${frequency} for word: ${word}`);
          migratedCount++;
          
          // 迁移成功后删除本地临时数据
          localStorage.removeItem(`word_frequency_${word}`);
        } catch (error) {
          errors.push(`Failed to migrate frequency for ${word}: ${error}`);
        }
      })();

      migrationPromises.push(promise);
    }

    // 3. 等待所有迁移完成
    await Promise.all(migrationPromises);

    // 4. 标记迁移完成
    localStorage.setItem('_migration_completed', new Date().toISOString());

    console.log(`Migration completed: ${migratedCount} items migrated, ${errors.length} errors`);

    return {
      success: errors.length === 0,
      migratedCount,
      errors
    };
  } catch (error) {
    console.error("Migration failed:", error);
    return {
      success: false,
      migratedCount,
      errors: [...errors, `Critical error: ${error}`]
    };
  }
};

/**
 * 收集所有本地 localStorage 中的临时数据
 */
function collectLocalData(): LocalStorageData {
  const inputTimes = new Map<string, number[]>();
  const frequencies = new Map<string, number>();

  // 遍历所有 localStorage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // 收集 inputTimes 数据
    if (key.startsWith('inputTimes_')) {
      const word = key.substring('inputTimes_'.length);
      try {
        const times = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(times) && times.length > 0) {
          inputTimes.set(word, times);
        }
      } catch (error) {
        console.error(`Failed to parse inputTimes for ${word}:`, error);
      }
    }

    // 收集 frequency 数据
    if (key.startsWith('word_frequency_')) {
      const word = key.substring('word_frequency_'.length);
      try {
        const frequency = Number(localStorage.getItem(key));
        if (!isNaN(frequency)) {
          frequencies.set(word, frequency);
        }
      } catch (error) {
        console.error(`Failed to parse frequency for ${word}:`, error);
      }
    }
  }

  return { inputTimes, frequencies };
}

/**
 * 清理所有已迁移的本地数据
 * 注意：只清理已确认迁移成功的数据
 */
export const cleanupMigratedLocalData = (): number => {
  const keysToClean: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // 清理临时数据
    if (key.startsWith('inputTimes_') || key.startsWith('word_frequency_')) {
      keysToClean.push(key);
    }
  }

  keysToClean.forEach(key => {
    localStorage.removeItem(key);
    console.log(`Cleaned up: ${key}`);
  });

  console.log(`Cleaned up ${keysToClean.length} local temporary items`);
  return keysToClean.length;
};

/**
 * 检查是否有待迁移的本地数据
 */
export const hasPendingMigration = (): boolean => {
  const migrationCompleted = localStorage.getItem('_migration_completed');
  if (migrationCompleted) {
    return false; // 已经迁移过
  }

  // 检查是否有临时数据
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (key.startsWith('inputTimes_') || key.startsWith('word_frequency_')) {
      return true;
    }
  }

  return false;
};
