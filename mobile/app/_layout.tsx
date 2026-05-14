import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/theme';
import { AuthProvider, useAuth } from '../context/AuthContext';

const AUTH_SCREENS = ['login', 'signup'];

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const current = segments[0] as string | undefined;
    const inAuth = AUTH_SCREENS.includes(current ?? '');
    const inWorker = current === '(worker)';
    const onWorkerSetup = current === 'worker-signup';

    if (!user && !inAuth && !onWorkerSetup) {
      router.replace('/login');
    } else if (user && inAuth) {
      router.replace(user.role === 'worker' ? '/(worker)/jobs' : '/');
    } else if (user && user.role === 'worker' && !inWorker && !onWorkerSetup) {
      router.replace('/(worker)/jobs');
    }
  }, [user, loading, segments]);

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
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
