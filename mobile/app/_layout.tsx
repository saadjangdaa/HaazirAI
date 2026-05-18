import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '../constants/theme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';

SplashScreen.preventAutoHideAsync();

const AUTH_SCREENS = ['login', 'signup'];

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);

  // Wait one tick after mount before navigating — expo-router v6 requirement
  useEffect(() => {
    const t = setTimeout(() => setIsReady(true), 0);
    return () => clearTimeout(t);
  }, []);

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
  }, [isReady, user, loading, segments]);

  return (
    <>
      <StatusBar style="dark" backgroundColor={Colors.background} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.primary,
          headerTitleStyle: { color: Colors.textPrimary, fontWeight: '700' },
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
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
