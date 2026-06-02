import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, usePathname, useRouter, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';
import { AuthProvider, useAuth, AuthUser } from '../context/AuthContext';
import AuthSplash from '../components/AuthSplash';
import { auth } from '../services/firebase';
import { LanguageProvider } from '../context/LanguageContext';
import { MockDataProvider } from '../context/MockDataContext';
import NotificationBootstrap from '../components/NotificationBootstrap';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'login',
};

function homeRoute(user: AuthUser): '/(worker)/jobs' | '/' {
  return user.role === 'worker' ? '/(worker)/jobs' : '/';
}

function isAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/signup';
}

function isWorkerSignupPath(pathname: string): boolean {
  return pathname === '/worker-signup';
}

function isWorkerPendingPath(pathname: string): boolean {
  return pathname === '/worker-pending';
}

function isLangSelectPath(pathname: string): boolean {
  return pathname === '/language-select';
}

function isOnboardingPath(pathname: string): boolean {
  return pathname === '/onboarding';
}

/**
 * Single routing gate — runs only after Firebase auth + profile bootstrap (loading=false).
 * hasSessionThisLaunch: user signed in this app session (not just Firebase storage restore).
 * needsLanguagePicker: customer must complete language screen before home.
 */
function AuthNavigationGuard() {
  const { user, loading, hasSessionThisLaunch, needsLanguagePicker } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const lastNav = useRef<string | null>(null);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  // Read onboarding flag once on mount — before any navigation decision
  useEffect(() => {
    AsyncStorage.getItem('haazir_onboarding_seen').then((val) => {
      setOnboardingSeen(val === '1');
    });
  }, []);

  useEffect(() => {
    // Wait until both auth AND onboarding check are ready
    if (loading || !navigationState?.key || onboardingSeen === null) return;

    const firebaseUser = auth.currentUser;
    const isAuthenticated = !!firebaseUser && !!user && firebaseUser.uid === user.id;

    let target: string | null = null;

    if (!isAuthenticated) {
      // Always send to login if not on an auth/onboarding path
      if (!isAuthPath(pathname) && !isOnboardingPath(pathname)) {
        // Show onboarding first for truly first-time users, else login
        target = (!onboardingSeen) ? '/onboarding' : '/login';
      }
    } else if (!hasSessionThisLaunch) {
      if (!isAuthPath(pathname) && !isWorkerSignupPath(pathname)) {
        target = '/login';
      }
    } else if (needsLanguagePicker && user.role === 'customer') {
      if (!isLangSelectPath(pathname)) {
        target = '/language-select';
      }
    } else if (user.role === 'worker' && !user.workerOnboarded) {
      if (!isWorkerSignupPath(pathname)) {
        target = '/worker-signup';
      }
    } else if (user.role === 'worker') {
      const home = homeRoute(user);
      if (
        isAuthPath(pathname) ||
        isLangSelectPath(pathname) ||
        isWorkerSignupPath(pathname) ||
        isWorkerPendingPath(pathname)
      ) {
        target = home;
      }
    } else {
      const home = homeRoute(user);
      if (isAuthPath(pathname) || isLangSelectPath(pathname) || isWorkerSignupPath(pathname)) {
        target = home;
      }
    }

    if (!target || (lastNav.current === target && pathname === target)) return;
    lastNav.current = target;
    router.replace(target as '/login');
  }, [user, loading, hasSessionThisLaunch, needsLanguagePicker, pathname, router, navigationState?.key, onboardingSeen]);

  useEffect(() => {
    if (loading) lastNav.current = null;
  }, [loading]);

  useEffect(() => {
    if (!user || !hasSessionThisLaunch) lastNav.current = null;
  }, [user, hasSessionThisLaunch]);

  useEffect(() => {
    if (!needsLanguagePicker) lastNav.current = null;
  }, [needsLanguagePicker]);

  return null;
}

function RootLayoutNav() {
  const { loading } = useAuth();
  const navigationState = useRootNavigationState();
  const authReady = !loading && !!navigationState?.key;

  // Hide the native splash screen only once auth is fully resolved
  useEffect(() => {
    if (authReady) {
      SplashScreen.hideAsync();
    }
  }, [authReady]);

  if (!authReady) {
    return (
      <>
        <StatusBar style="dark" backgroundColor={Colors.background} />
        <AuthSplash />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor={Colors.background} />
      <Stack
        initialRouteName="login"
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.primary,
          headerTitleStyle: { color: Colors.textPrimary, fontWeight: '700' },
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ title: 'Account Banayein', headerBackVisible: false }} />
        <Stack.Screen name="worker-signup" options={{ headerShown: false }} />
        <Stack.Screen name="worker-pending" options={{ headerShown: false }} />
        <Stack.Screen name="language-select" options={{ headerShown: false }} />
        <Stack.Screen name="(customer)" options={{ headerShown: false }} />
        <Stack.Screen name="(worker)" options={{ headerShown: false }} />
        <Stack.Screen name="nearby" options={{ headerShown: false }} />
        <Stack.Screen name="results" options={{ headerShown: false }} />
        <Stack.Screen name="booking" options={{ headerShown: false }} />
        <Stack.Screen name="tracking" options={{ headerShown: false }} />
        <Stack.Screen name="feedback" options={{ headerShown: false }} />
        <Stack.Screen name="dispute" options={{ headerShown: false }} />
        <Stack.Screen name="logs" options={{ title: 'Agent Logs (Judges View)' }} />
        <Stack.Screen name="agent-traces" options={{ headerShown: false }} />
        <Stack.Screen name="voice-conversation" options={{ headerShown: false }} />
        <Stack.Screen name="worker-chat" options={{ headerShown: false }} />
        <Stack.Screen name="job-chat" options={{ headerShown: false }} />
        <Stack.Screen name="job-detail" options={{ headerShown: false }} />
        <Stack.Screen name="voice-chats" options={{ headerShown: false }} />
      </Stack>
      <AuthNavigationGuard />
      <NotificationBootstrap />
    </>
  );
}

export default function RootLayout() {
  return (
    <MockDataProvider>
      <LanguageProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </LanguageProvider>
    </MockDataProvider>
  );
}
