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

// Firebase 12 requires a CLASS (not plain object) for persistence so that
// _getInstance() passes `cls instanceof Function`. We define it here in our
// Babel-transpiled code so Hermes always sees it as a proper constructor.
class AsyncStoragePersistence {
  static type = 'LOCAL' as const;
  readonly type = 'LOCAL' as const;

  async _isAvailable(): Promise<boolean> {
    try {
      await AsyncStorage.setItem('__firebase_avail__', '1');
      await AsyncStorage.removeItem('__firebase_avail__');
      return true;
    } catch {
      return false;
    }
  }

  _set(key: string, value: unknown): Promise<void> {
    return AsyncStorage.setItem(key, JSON.stringify(value));
  }

  async _get(key: string): Promise<unknown> {
    const json = await AsyncStorage.getItem(key);
    if (json === null) return null;
    try { return JSON.parse(json); } catch { return json; }
  }

  _remove(key: string): Promise<void> {
    return AsyncStorage.removeItem(key);
  }

  _addListener(_key: string, _listener: unknown): void { /* not needed for RN */ }
  _removeListener(_key: string, _listener: unknown): void { /* not needed for RN */ }
}

function initAuth() {
  try {
    return initializeAuth(app, {
      persistence: AsyncStoragePersistence as any,
    });
  } catch {
    // Already initialized (hot reload / fast refresh)
    return getAuth(app);
  }
}

export const auth = initAuth();
