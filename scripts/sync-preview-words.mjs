import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "learning-english-477407";
const PREVIEW_USER_ID = "preview";

const prodUserId = process.env.PROD_USER_UID;
if (!prodUserId) {
  console.error("Missing PROD_USER_UID environment variable");
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore();

const sourceCollection = db.collection("users").doc(prodUserId).collection("words");
const targetCollection = db.collection("users").doc(PREVIEW_USER_ID).collection("words");

const [sourceSnapshot, targetSnapshot] = await Promise.all([
  sourceCollection.get(),
  targetCollection.get(),
]);
console.log(`Fetched ${sourceSnapshot.size} prod words, ${targetSnapshot.size} preview words`);

const sourceData = new Map(sourceSnapshot.docs.map((doc) => [doc.id, doc.data()]));
const targetData = new Map(targetSnapshot.docs.map((doc) => [doc.id, doc.data()]));

const toWrite = [];
const toDelete = [];

for (const [id, data] of sourceData) {
  const existing = targetData.get(id);
  if (!existing || JSON.stringify(existing) !== JSON.stringify(data)) {
    toWrite.push([id, data]);
  }
}

for (const id of targetData.keys()) {
  if (!sourceData.has(id)) {
    toDelete.push(id);
  }
}

console.log(`Diff: ${toWrite.length} to write, ${toDelete.length} to delete`);

const BATCH_SIZE = 500;
const operations = [
  ...toWrite.map(([id, data]) => (batch) => batch.set(targetCollection.doc(id), data)),
  ...toDelete.map((id) => (batch) => batch.delete(targetCollection.doc(id))),
];

for (let i = 0; i < operations.length; i += BATCH_SIZE) {
  const batch = db.batch();
  for (const apply of operations.slice(i, i + BATCH_SIZE)) {
    apply(batch);
  }
  await batch.commit();
  console.log(`Committed ${Math.min(i + BATCH_SIZE, operations.length)}/${operations.length} operations`);
}

console.log("Sync completed");
