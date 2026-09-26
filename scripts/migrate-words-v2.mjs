import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "learning-english-477407";
const PREVIEW_USER_ID = "preview";
const BATCH_SIZE = 500;
const MAX_RETRIES = 2;
const MODEL_VERSION = "fsrs-6";

const OLD_FIELDS = [
  "correctCount",
  "totalAttempts",
  "lastPracticedAt",
  "correctPracticeDates",
  "attemptHistory",
];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const uidArgIndex = args.indexOf("--uid");
const uidArg = uidArgIndex >= 0 ? args[uidArgIndex + 1] : undefined;

const prodUserId = process.env.PROD_USER_UID;
const targetUserIds = uidArg
  ? [uidArg]
  : [prodUserId, PREVIEW_USER_ID].filter(Boolean);

if (!uidArg && !prodUserId) {
  console.error(
    "Missing target: set PROD_USER_UID or pass --uid <uid> (preview 可用 --uid preview)"
  );
  process.exit(1);
}

const initialMemory = (now) => ({
  stability: 0,
  difficulty: 0,
  state: "new",
  learningSteps: 0,
  due: now,
  lastReviewAt: null,
  lastGrade: null,
  reps: 0,
  lapses: 0,
  modelVersion: MODEL_VERSION,
});

const initialStats = () => ({
  reviewDays: 0,
  lastReviewDay: null,
  dailyReviews: 0,
  hints: 0,
});

const buildUpdate = (data, now) => {
  const hasNewSchema = Boolean(data.memory) && typeof data.memory === "object";
  const update = {};
  const deletedFields = [];

  for (const field of OLD_FIELDS) {
    if (field in data) {
      update[field] = FieldValue.delete();
      deletedFields.push(field);
    }
  }

  if (!hasNewSchema) {
    update.memory = initialMemory(now);
    update.stats = initialStats();
    update.inputTimes = [];
    update.reviews = [];
  } else {
    if (!data.stats || typeof data.stats !== "object") {
      update.stats = initialStats();
    }
    if (!Array.isArray(data.inputTimes)) {
      update.inputTimes = [];
    }
    if (!Array.isArray(data.reviews)) {
      update.reviews = [];
    }
  }

  return Object.keys(update).length > 0 ? { update, deletedFields } : null;
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
        `Commit failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${error.message ?? error}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore();

const migrateUserWords = async (userId) => {
  const collection = db.collection("users").doc(userId).collection("words");
  const snapshot = await collection.get();
  const now = Date.now();
  const updates = [];
  let skipped = 0;

  snapshot.docs.forEach((doc) => {
    const plan = buildUpdate(doc.data(), now);
    if (!plan) {
      skipped += 1;
      return;
    }
    updates.push([doc.id, plan]);
  });

  console.log(
    `[${userId}] ${snapshot.size} docs, ${updates.length} to migrate, ${skipped} already on new schema`
  );

  if (updates.length > 0) {
    const [sampleId, samplePlan] = updates[0];
    const setKeys = Object.keys(samplePlan.update).filter(
      (key) => !samplePlan.deletedFields.includes(key)
    );
    console.log(
      `[${userId}] sample ${sampleId}: delete=[${samplePlan.deletedFields.join(
        ","
      )}] set=[${setKeys.join(",")}]`
    );
  }

  if (!apply) {
    console.log(`[${userId}] dry-run，未写入；加 --apply 执行`);
    return;
  }

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const [id, plan] of updates.slice(i, i + BATCH_SIZE)) {
      batch.update(collection.doc(id), plan.update);
    }
    await commitWithRetry(batch);
    console.log(
      `[${userId}] committed ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}`
    );
  }
};

for (const userId of targetUserIds) {
  await migrateUserWords(userId);
}

await app.delete();
console.log(apply ? "Migration completed" : "Dry-run completed");
