/**
 * Native Firebase entry (Metro resolves ./firebase → firebase.native.ts on device).
 */
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
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

// Firebase 12 removed getReactNativePersistence — implement AsyncStorage persistence directly
const asyncStoragePersistence = {
  type: 'LOCAL' as const,
  async _isAvailable() { return true; },
  async _set(key: string, value: string) { await AsyncStorage.setItem(key, value); },
  async _get(key: string) { return AsyncStorage.getItem(key); },
  async _remove(key: string) { await AsyncStorage.removeItem(key); },
  _addListener(_key: string, _listener: unknown) {},
  _removeListener(_key: string, _listener: unknown) {},
};

function initAuth() {
  try {
    return initializeAuth(app, {
      persistence: asyncStoragePersistence as any,
    });
  } catch {
    // Already initialized on re-render / hot reload
    return getAuth(app);
  }
}

export const auth = initAuth();
