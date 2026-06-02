import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { registerForPushNotifications, subscribeNotificationResponses } from '../services/pushNotifications';
import { syncUserProfile } from '../services/api';

/**
 * Registers notification tap navigation and refreshes push token on app resume.
 * No UI — does not send notifications (backend only).
 */
export default function NotificationBootstrap() {
  const { user } = useAuth();
  const router = useRouter();
  const lastToken = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !user.role) return;

    let removeListener: (() => void) | null = null;
    let cancelled = false;

    subscribeNotificationResponses(user.role, (target) => {
      router.push(target as never);
    }).then((unsub) => {
      if (!cancelled) removeListener = unsub;
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [user?.id, user?.role, router]);

  useEffect(() => {
    if (!user?.id) return;

    const refreshToken = async () => {
      const token = await registerForPushNotifications();
      if (!token || token === lastToken.current) return;
      lastToken.current = token;
      try {
        await syncUserProfile({
          user_id: user.id,
          email: user.email,
          role: user.role,
          username: user.username,
          push_token: token,
        });
      } catch {
        // non-blocking
      }
    };

    const onState = (state: AppStateStatus) => {
      if (state === 'active') refreshToken();
    };

    refreshToken();
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [user?.id, user?.email, user?.role, user?.username]);

  return null;
}
