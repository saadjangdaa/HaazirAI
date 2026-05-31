import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { getUserBookings, UserBooking, formatApiError, requireUserId } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useMockData } from '../../context/MockDataContext';
import { useLang } from '../../context/LanguageContext';
import { MOCK_CUSTOMER_BOOKINGS } from '../../data/mockData';
import CustomerSidebar from '../../components/CustomerSidebar';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Provider assigned',
  confirmed: 'Confirmed',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  refunded: 'Refunded',
};

function statusColors(status: string) {
  const s = status.toLowerCase();
  if (['completed', 'refunded'].includes(s)) {
    return { color: Colors.success, bg: Colors.surfaceElevated };
  }
  if (['cancelled', 'disputed'].includes(s)) {
    return { color: Colors.danger, bg: Colors.dangerDim };
  }
  if (['on_the_way', 'arrived', 'in_progress'].includes(s)) {
    return { color: Colors.primary, bg: Colors.primaryDim };
  }
  return { color: Colors.warning, bg: Colors.surfaceElevated };
}

function isActive(status: string) {
  return !['completed', 'cancelled', 'refunded', 'disputed'].includes(status.toLowerCase());
}

export default function BookingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const { tr } = useLang();
  const [bookings, setBookings] = useState<UserBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    if (isMockMode) {
      setBookings(MOCK_CUSTOMER_BOOKINGS);
      setLoading(false);
      setError(null);
      return;
    }
    if (!user?.id) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const uid = requireUserId(user);
      const rows = await getUserBookings(uid);
      setBookings(rows);
    } catch (e) {
      setError(formatApiError(e));
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isMockMode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const activeCount = bookings.filter((b) => isActive(b.status)).length;
  const totalSpent = bookings.reduce((sum, b) => sum + (Number(b.price) || 0), 0);

  if (loading && bookings.length === 0) {
    return (
      <View style={styles.rootWrap}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
            <Ionicons name="menu" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{tr.pageBookings}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Bookings load ho rahi hain...</Text>
        </View>
        <CustomerSidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </View>
    );
  }

  return (
    <View style={styles.rootWrap}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setSidebarOpen(true)}>
          <Ionicons name="menu" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tr.pageBookings}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
      >

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: Colors.primary }]}>{bookings.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: Colors.warning }]}>{activeCount}</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>Rs {(totalSpent / 1000).toFixed(1)}k</Text>
          <Text style={styles.summaryLabel}>Spent</Text>
        </View>
      </View>

      {error && (
        <TouchableOpacity style={styles.errorCard} onPress={load}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      )}

      {!error && bookings.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{tr.noBookings} — {tr.noBookingsSub}</Text>
        </View>
      )}

      {bookings.map((b) => {
        const sc = statusColors(b.status);
        const active = isActive(b.status);
        const label = STATUS_LABEL[b.status] || b.status;
        return (
          <View key={b.booking_id} style={[styles.card, active && styles.cardActive, Shadow.card]}>
            {active && (
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>Live</Text>
              </View>
            )}
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardSvc}>{b.service || 'Service'}</Text>
                <Text style={styles.cardWho}>
                  {b.provider_name || 'Provider'} · {b.scheduled_time || 'TBD'}
                </Text>
                <Text style={styles.cardId}>#{b.booking_id}</Text>
              </View>
              <View style={styles.cardRight}>
                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.statusText, { color: sc.color }]}>{label}</Text>
                </View>
                {b.price != null && (
                  <Text style={styles.cardPrice}>Rs {Number(b.price).toLocaleString()}</Text>
                )}
              </View>
            </View>
            {active && (
              <TouchableOpacity
                style={styles.trackBtn}
                onPress={() =>
                  router.push({ pathname: '/tracking', params: { bookingId: b.booking_id } })
                }
              >
                <Text style={styles.trackBtnText}>Track karein →</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      </ScrollView>

      <CustomerSidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrap: { flex: 1, backgroundColor: Colors.background },
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  menuBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  content: { padding: Spacing.md, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { marginTop: Spacing.md, color: Colors.textMuted },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  summaryRow: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  errorCard: {
    backgroundColor: Colors.dangerDim, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: FontSize.sm },
  retryText: { color: Colors.danger, fontSize: FontSize.xs, marginTop: 4, fontWeight: '700' },
  emptyCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: Radius.xl, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md,
  },
  cardActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceElevated },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  activeBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardSvc: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  cardWho: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  cardId: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  cardPrice: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  trackBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.sm,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  trackBtnText: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '800' },
});
