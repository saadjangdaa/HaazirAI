import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, usePathname, useRouter, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../constants/theme';
import { AuthProvider, useAuth, AuthUser } from '../context/AuthContext';
import AuthSplash from '../components/AuthSplash';
import { auth } from '../services/firebase';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';

SplashScreen.preventAutoHideAsync();

/** Cold start must land on login — not a tab group or worker-signup. */
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

/**
 * Single routing gate — runs only after Firebase auth + profile bootstrap (loading=false).
 * Firebase Auth session is the source of truth for "logged in".
 */
function AuthNavigationGuard() {
  const { user, loading, allowPostAuthRedirect } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const lastNav = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !navigationState?.key) return;

    const firebaseUser = auth.currentUser;
    const isAuthenticated =
      !!firebaseUser && !!user && firebaseUser.uid === user.id;

    let target: string | null = null;

    if (!isAuthenticated || !allowPostAuthRedirect) {
      if (!isAuthPath(pathname)) {
        target = '/login';
      }
    } else if (user.role === 'worker' && !user.workerOnboarded) {
      if (!isWorkerSignupPath(pathname)) {
        target = '/worker-signup';
      }
    } else {
      const home = homeRoute(user);
      if (isAuthPath(pathname) || isWorkerSignupPath(pathname)) {
        target = home;
      }
  useEffect(() => {
    if (!isReady || loading) return;

    const current = segments[0] as string | undefined;
    const inAuth = AUTH_SCREENS.includes(current ?? '');
    const inWorker = current === '(worker)';
    const onWorkerSetup = current === 'worker-signup';
    const onLangSelect = current === 'language-select';

    if (!user && !inAuth && !onWorkerSetup) {
      router.replace('/login');
    } else if (user && inAuth) {
      // After login → pick language first
      router.replace('/language-select');
    } else if (user && user.role === 'worker' && !inWorker && !onWorkerSetup && !onLangSelect) {
      router.replace('/(worker)/jobs');
    }

    if (!target || lastNav.current === target) return;

    lastNav.current = target;
    router.replace(target as '/login');
  }, [user, loading, allowPostAuthRedirect, pathname, router, navigationState?.key]);

  useEffect(() => {
    if (loading) lastNav.current = null;
  }, [loading]);

  return null;
}

function RootLayoutNav() {
  const { loading } = useAuth();
  const navigationState = useRootNavigationState();
  const authReady = !loading && !!navigationState?.key;

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
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="signup"
          options={{ title: 'Account Banayein', headerBackVisible: false }}
        />
        <Stack.Screen
          name="worker-signup"
          options={{ title: 'Worker Registration', headerBackVisible: false }}
        />
        <Stack.Screen name="language-select" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: 'Account Banayein' }} />
        <Stack.Screen name="worker-signup" options={{ title: 'Worker Registration' }} />
        <Stack.Screen name="(customer)" options={{ headerShown: false }} />
        <Stack.Screen name="(worker)" options={{ headerShown: false }} />
        <Stack.Screen name="results" options={{ title: 'Providers Mila Diye' }} />
        <Stack.Screen name="booking" options={{ title: 'Booking Confirm Karein' }} />
        <Stack.Screen name="tracking" options={{ title: 'Service Progress' }} />
        <Stack.Screen name="feedback" options={{ title: 'Feedback Dein' }} />
        <Stack.Screen name="dispute" options={{ title: 'Complaint / Dispute' }} />
        <Stack.Screen name="logs" options={{ title: 'Agent Logs (Judges View)' }} />
        <Stack.Screen name="voice-conversation" options={{ headerShown: false }} />
      </Stack>
      <AuthNavigationGuard />
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </LanguageProvider>
  );
}
