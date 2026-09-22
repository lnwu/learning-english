import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "learning-english-477407";
const PREVIEW_USER_ID = "preview";
const SUBCOLLECTIONS = ["words", "practiceTime"];
const BATCH_SIZE = 500;
const MAX_RETRIES = 2;

const prodUserId = process.env.PROD_USER_UID;
if (!prodUserId) {
  console.error("Missing PROD_USER_UID environment variable");
  process.exit(1);
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore();

const stableStringify = (value) => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") {
    if (typeof value.toJSON === "function") {
      return JSON.stringify(value.toJSON());
    }
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(",")}]`;
    }
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

const commitWithRetry = async (batch) => {
  for (let attempt = 0; ; attempt++) {
    try {
      await batch.commit();
      return;
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      const delay = 1000 * 2 ** attempt;
      console.warn(
        `Commit failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${error.message ?? error}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const syncCollection = async (name) => {
  const sourceCollection = db
    .collection("users")
    .doc(prodUserId)
    .collection(name);
  const targetCollection = db
    .collection("users")
    .doc(PREVIEW_USER_ID)
    .collection(name);

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    sourceCollection.get(),
    targetCollection.get(),
  ]);
  console.log(
    `[${name}] Fetched ${sourceSnapshot.size} prod docs, ${targetSnapshot.size} preview docs`,
  );

  const sourceData = new Map(
    sourceSnapshot.docs.map((doc) => [doc.id, doc.data()]),
  );
  const targetData = new Map(
    targetSnapshot.docs.map((doc) => [doc.id, doc.data()]),
  );

  const toWrite = [];
  const toDelete = [];

  for (const [id, data] of sourceData) {
    const existing = targetData.get(id);
    if (!existing || stableStringify(existing) !== stableStringify(data)) {
      toWrite.push([id, data]);
    }
  }

  for (const id of targetData.keys()) {
    if (!sourceData.has(id)) {
      toDelete.push(id);
    }
  }

  console.log(
    `[${name}] Diff: ${toWrite.length} to write, ${toDelete.length} to delete`,
  );

  const operations = [
    ...toWrite.map(
      ([id, data]) =>
        (batch) =>
          batch.set(targetCollection.doc(id), data),
    ),
    ...toDelete.map((id) => (batch) => batch.delete(targetCollection.doc(id))),
  ];

  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const apply of operations.slice(i, i + BATCH_SIZE)) {
      apply(batch);
    }
    await commitWithRetry(batch);
    console.log(
      `[${name}] Committed ${Math.min(i + BATCH_SIZE, operations.length)}/${operations.length} operations`,
    );
  }
};

const results = await Promise.allSettled(
  SUBCOLLECTIONS.map(syncCollection),
);
const failures = results.filter((result) => result.status === "rejected");
for (const failure of failures) {
  console.error(failure.reason?.stack ?? String(failure.reason));
}
await app.delete();
if (failures.length > 0) {
  console.error(`Sync failed for ${failures.length} collection(s)`);
  process.exit(1);
}
console.log("Sync completed");
