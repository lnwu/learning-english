import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

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

// Initialize Firebase (only once)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Helper function to ensure Firebase Auth is signed in
export const ensureFirebaseAuth = async (userEmail: string) => {
  // For now, we'll use the email as the identifier
  // In a production app, you'd want to use custom tokens
  if (!auth.currentUser) {
    // Sign in anonymously to Firebase Auth
    // This gives us a Firebase Auth token for security rules
    await signInAnonymously(auth);
  }
  return auth.currentUser;
};
