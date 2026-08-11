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
const targetDoc = db.collection("users").doc(PREVIEW_USER_ID);
const targetCollection = targetDoc.collection("words");

const snapshot = await sourceCollection.get();
console.log(`Fetched ${snapshot.size} words from users/${prodUserId}/words`);

await db.recursiveDelete(targetDoc);
console.log(`Cleared users/${PREVIEW_USER_ID}`);

const BATCH_SIZE = 500;
for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
  const batch = db.batch();
  for (const doc of snapshot.docs.slice(i, i + BATCH_SIZE)) {
    batch.set(targetCollection.doc(doc.id), doc.data());
  }
  await batch.commit();
  console.log(`Synced ${Math.min(i + BATCH_SIZE, snapshot.size)}/${snapshot.size} words`);
}

console.log("Sync completed");
