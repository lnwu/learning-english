import { writeBatch, type WriteBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const FIRESTORE_BATCH_LIMIT = 500;

export const commitBatchOperations = async (
  operations: Array<(batch: WriteBatch) => void>
) => {
  for (let i = 0; i < operations.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations
      .slice(i, i + FIRESTORE_BATCH_LIMIT)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
};
