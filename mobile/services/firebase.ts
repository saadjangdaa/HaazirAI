import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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

function getFirebaseAuth() {
  // On native, use AsyncStorage for persistence so auth state survives app restarts
  if (Platform.OS !== 'web') {
    try {
      return initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // Already initialized — just return existing instance
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const auth = getFirebaseAuth();
