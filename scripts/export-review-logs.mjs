import { mkdir, writeFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "learning-english-477407";

const args = process.argv.slice(2);
const uidArgIndex = args.indexOf("--uid");
const uid = uidArgIndex >= 0 ? args[uidArgIndex + 1] : process.env.PROD_USER_UID;
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : "calibration-out";

if (!uid) {
  console.error("Missing user id: set PROD_USER_UID or pass --uid <uid>");
  process.exit(1);
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const db = getFirestore();

const snapshot = await db
  .collection("users")
  .doc(uid)
  .collection("words")
  .get();

const cards = [];
const rows = [];

for (const doc of snapshot.docs) {
  const data = doc.data();
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const valid = reviews
    .filter(
      (review) =>
        review &&
        typeof review.at === "number" &&
        (review.g === 1 || review.g === 2 || review.g === 3)
    )
    .map((review) => ({
      at: review.at,
      g: review.g,
      h: review.h === true,
      r: typeof review.r === "number" ? review.r : null,
    }))
    .sort((a, b) => a.at - b.at);

  if (valid.length === 0) continue;

  cards.push({ cardId: doc.id, word: data.word, reviews: valid });
  for (const review of valid) {
    rows.push([doc.id, review.at, review.g]);
  }
}

rows.sort((a, b) =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]
);

const csv = [
  "card_id,review_time,review_rating",
  ...rows.map((row) => row.join(",")),
].join("\n");

await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/revlog.csv`, `${csv}\n`);
await writeFile(
  `${outDir}/reviews.json`,
  JSON.stringify({ userId: uid, exportedAt: Date.now(), cards }, null, 2)
);

console.log(
  `[export] user ${uid}: ${snapshot.size} words, ${cards.length} cards with reviews, ${rows.length} review rows`
);
console.log(`[export] wrote ${outDir}/revlog.csv and ${outDir}/reviews.json`);
console.log(`[export] 下一步：bun run calibrate:report ${outDir}/reviews.json`);

await app.delete();
