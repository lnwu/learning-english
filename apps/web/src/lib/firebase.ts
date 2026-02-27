import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const firebaseMessagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const firebaseMeasurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

const missingFirebaseEnvs = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", firebaseApiKey],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", firebaseAuthDomain],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebaseProjectId],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", firebaseStorageBucket],
  ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", firebaseMessagingSenderId],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", firebaseAppId],
  ["NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", firebaseMeasurementId],
].filter(([, value]) => !value);

if (missingFirebaseEnvs.length > 0) {
  throw new Error(
    `Missing Firebase environment variables: ${missingFirebaseEnvs
      .map(([name]) => name)
      .join(", ")}.`
  );
}

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
  measurementId: firebaseMeasurementId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);

export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  return signInWithPopup(auth, googleProvider);
};

export const signOut = async () => {
  return firebaseSignOut(auth);
};

export { onAuthStateChanged, type User };
