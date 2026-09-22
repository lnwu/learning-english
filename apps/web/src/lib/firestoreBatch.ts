import { writeBatch, type WriteBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { commitInChunks } from "@/lib/chunkedCommit";

export const FIRESTORE_BATCH_LIMIT = 500;

export const commitBatchOperations = async (
  operations: Array<(batch: WriteBatch) => void>
) => {
  await commitInChunks({
    items: operations,
    chunkSize: FIRESTORE_BATCH_LIMIT,
    commitChunk: async (chunk) => {
      const batch = writeBatch(db);
      chunk.forEach((operation) => operation(batch));
      await batch.commit();
    },
  });
};
