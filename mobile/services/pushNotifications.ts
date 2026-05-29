import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type { UserRole } from '../context/AuthContext';
import { resolveNotificationRoute, NotificationPayload } from './pushNavigation';

/**
 * Remote push is NOT available in Expo Go (SDK 53+).
 * This module must never import expo-notifications at load time in Expo Go.
 */
export function isPushAvailable(): boolean {
  return Constants.appOwnership !== 'expo';
}

type NotificationsModule = typeof import('expo-notifications');

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!isPushAvailable()) return null;
  return import('expo-notifications');
}

async function ensureAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Haazir AI',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!isPushAvailable()) {
    if (__DEV__) {
      console.warn('[Push] Skipped in Expo Go — use a development build for push');
    }
    return null;
  }

  if (!Device.isDevice) {
    console.warn('[Push] Use a physical device for push tokens');
    return null;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  await ensureAndroidChannel(Notifications);

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return token.data;
  } catch (e) {
    console.warn('[Push] Token error:', e);
    return null;
  }
}

/** Tap handler — navigate from notification data payload (backend event_type → data.type). */
export async function subscribeNotificationResponses(
  userRole: UserRole,
  onNavigate: (target: { pathname: string; params?: Record<string, string> }) => void
): Promise<(() => void) | null> {
  if (!isPushAvailable()) return null;
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const raw = response.notification.request.content.data as Record<string, unknown>;
    const payload: NotificationPayload = {
      type: raw.type != null ? String(raw.type) : undefined,
      booking_id: raw.booking_id != null ? String(raw.booking_id) : undefined,
      dispute_id: raw.dispute_id != null ? String(raw.dispute_id) : undefined,
    };
    const target = resolveNotificationRoute(payload, userRole);
    if (target) onNavigate(target);
  });

  return () => sub.remove();
}
