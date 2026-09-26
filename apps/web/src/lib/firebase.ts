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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const REQUIRED_ENV_ENTRIES = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", firebaseConfig.apiKey],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", firebaseConfig.storageBucket],
  ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", firebaseConfig.messagingSenderId],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", firebaseConfig.appId],
  ["NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", firebaseConfig.measurementId],
] as const;

const readFirebaseConfig = () => {
  const missing = REQUIRED_ENV_ENTRIES.filter(([, value]) => !value).map(
    ([name]) => name
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase environment variables: ${missing.join(", ")}.`
    );
  }

  return firebaseConfig;
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

const PREVIEW_USER_ID = "preview";

export const getEffectiveUserId = (user: User): string =>
  isPreviewEnv ? PREVIEW_USER_ID : user.uid;

export const signInAnonymously = async () =>
  firebaseSignInAnonymously(getAuthInstance());

export const signOut = async () => firebaseSignOut(getAuthInstance());

export { onAuthStateChanged, type User };
