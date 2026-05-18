import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyD2oRKslaA-6jqgfXfAFuNBYYwdpJHp-as',
  authDomain: 'haazir-ai.firebaseapp.com',
  projectId: 'haazir-ai',
  storageBucket: 'haazir-ai.firebasestorage.app',
  messagingSenderId: '999526081541',
  appId: '1:999526081541:web:c8585689d19f918b26e86c',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function getDb() {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}

export const db = getDb();

function initAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw e;
  }
}

export const auth = initAuth();
