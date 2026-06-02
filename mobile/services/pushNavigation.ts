import type { UserRole } from '../context/AuthContext';

export type NotificationPayload = {
  type?: string;
  booking_id?: string;
  dispute_id?: string;
};

type RouteTarget = {
  pathname: string;
  params?: Record<string, string>;
};

const STATUS_TRACKING_TYPES = new Set([
  'on_the_way',
  'arrived',
  'service_started',
  'en_route',
  'completed',
  'payment_update',
  'cancellation',
  'provider_assigned',
]);

/** Map FCM data.type → Expo Router screen (plan §7). */
export function resolveNotificationRoute(
  data: NotificationPayload,
  userRole: UserRole
): RouteTarget | null {
  const type = String(data.type || '').toLowerCase();
  const bookingId = String(data.booking_id || '').trim();

  if (
    type.startsWith('dispute_') ||
    type.includes('trust_warning') ||
    type === 'dispute_created' ||
    type === 'dispute_opened'
  ) {
    if (userRole === 'worker') {
      return { pathname: '/(worker)/disputes' };
    }
    return {
      pathname: '/(customer)/disputes',
      ...(bookingId ? { params: { bookingId } } : {}),
    };
  }

  if (type === 'reminder') {
    if (userRole === 'customer' && bookingId) {
      return { pathname: '/tracking', params: { bookingId } };
    }
    return { pathname: userRole === 'worker' ? '/(worker)/jobs' : '/(customer)/bookings' };
  }

  if (type === 'review_received') {
    return userRole === 'worker'
      ? { pathname: '/(worker)/jobs' }
      : { pathname: '/(customer)/bookings' };
  }

  if (STATUS_TRACKING_TYPES.has(type)) {
    if (userRole === 'customer' && bookingId) {
      return { pathname: '/tracking', params: { bookingId } };
    }
    return { pathname: userRole === 'worker' ? '/(worker)/jobs' : '/(customer)/bookings' };
  }

  if (
    type === 'booking_created' ||
    type === 'booking_confirmed' ||
    type === 'new_request' ||
    type === 'booking_assigned'
  ) {
    if (userRole === 'worker') {
      return { pathname: '/(worker)/jobs' };
    }
    if (bookingId) {
      return { pathname: '/tracking', params: { bookingId } };
    }
    return { pathname: '/(customer)/bookings' };
  }

  if (bookingId && userRole === 'customer') {
    return { pathname: '/tracking', params: { bookingId } };
  }
  if (userRole === 'worker') {
    return { pathname: '/(worker)/jobs' };
  }
  return { pathname: '/(customer)/bookings' };
}
