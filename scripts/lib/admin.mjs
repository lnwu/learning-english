import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "learning-english-477407";

export const initAdmin = () => {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
  return { app, db: getFirestore() };
};
