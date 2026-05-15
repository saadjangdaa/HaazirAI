import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2oRKslaA-6jqgfXfAFuNBYYwdpJHp-as",
  authDomain: "haazir-ai.firebaseapp.com",
  projectId: "haazir-ai",
  storageBucket: "haazir-ai.firebasestorage.app",
  messagingSenderId: "999526081541",
  appId: "1:999526081541:web:c8585689d19f918b26e86c",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/** Long polling avoids WebChannel issues on some React Native / Expo Go runtimes (often Android). */
function getDb() {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}

export const db = getDb();