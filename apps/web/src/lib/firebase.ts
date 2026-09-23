import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously as firebaseSignInAnonymously,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";

const REQUIRED_ENV_NAMES = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
] as const;

const readFirebaseConfig = () => {
  const missing = REQUIRED_ENV_NAMES.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase environment variables: ${missing.join(", ")}.`
    );
  }

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

const getFirebaseApp = (): FirebaseApp => {
  if (!app) {
    const config = readFirebaseConfig();
    app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  }
  return app;
};

export const getDb = (): Firestore => {
  if (!db) {
    const firebaseApp = getFirebaseApp();
    initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
    db = getFirestore(firebaseApp);
  }
  return db;
};

export const getAuthInstance = (): Auth => {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
};

export const signInWithGoogle = async () =>
  signInWithPopup(getAuthInstance(), new GoogleAuthProvider());

export const isPreviewEnv = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export const PREVIEW_USER_ID = "preview";

export const getEffectiveUserId = (user: User): string =>
  isPreviewEnv ? PREVIEW_USER_ID : user.uid;

export const signInAnonymously = async () =>
  firebaseSignInAnonymously(getAuthInstance());

export const signOut = async () => firebaseSignOut(getAuthInstance());

export { onAuthStateChanged, type User };
