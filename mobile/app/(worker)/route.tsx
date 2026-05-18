import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { formatApiError, getWorkerBookings, requireUserId, UserBooking } from '../../services/api';
import {
  formatWorkerPrice,
  isActiveWorkerStatus,
  routeStopLabel,
} from '../../utils/workerBookings';

const DOT_POSITIONS = [
  { x: '12%', y: '22%' },
  { x: '52%', y: '48%' },
  { x: '82%', y: '76%' },
];

export default function WorkerRouteScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<UserBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const uid = requireUserId(user);
      const res = await getWorkerBookings(uid);
      const active = (res.bookings || []).filter((b) => isActiveWorkerStatus(b.status));
      setBookings(active);
    } catch (e) {
      setError(formatApiError(e));
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const stops = useMemo(() => bookings.slice(0, 6).map((b, i) => routeStopLabel(b, i)), [bookings]);
  const expectedTotal = useMemo(
    () => bookings.reduce((sum, b) => sum + (Number(b.price) || 0), 0),
    [bookings]
  );
  const cityLabel = user?.workerData?.areas?.[0] || 'Islamabad';

  if (loading && bookings.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
      }
    >
      <Text style={styles.title}>Aaj ka Route 🗺️</Text>
      <Text style={styles.sub}>
        {stops.length > 0
          ? `${stops.length} active stop(s) — schedule ke mutabiq`
          : 'Koi active route nahi — jobs accept karein'}
      </Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.mapCard}>
        <View style={styles.mapGrid} />
        {DOT_POSITIONS.slice(0, Math.max(stops.length, 1)).map((pos, i) => (
          <View key={i} style={[styles.dot, { left: pos.x as `${number}%`, top: pos.y as `${number}%` }]}>
            <Text style={styles.dotNum}>{i + 1}</Text>
          </View>
        ))}
        <View style={styles.routeLine} />
        <Text style={styles.mapLabel}>📍 {cityLabel} Route</Text>
      </View>

      {stops.length === 0 ? (
        <Text style={styles.emptyText}>Active bookings yahan route stops ki surat mein dikhengi</Text>
      ) : (
        stops.map((stop) => (
          <View key={stop.n} style={[styles.stopCard, Shadow.card]}>
            <View style={styles.stopRow}>
              <View style={styles.stopNumBox}>
                <Text style={styles.stopNum}>{stop.n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stopTitle}>{stop.time} — {stop.svc}</Text>
                <Text style={styles.stopMeta}>{stop.who} · {stop.area}</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {stops.length > 1 && (
        <View style={styles.bufferCard}>
          <Text style={styles.bufferText}>⏱️ 30 min buffer included between jobs</Text>
        </View>
      )}

      <View style={[styles.tipCard, Shadow.card]}>
        <Text style={styles.tipTitle}>✨ AI Tip</Text>
        <Text style={styles.tipText}>
          {stops.length > 1
            ? `Aapke ${stops.length} bookings slot time ke order mein list hain — pehle job se shuru karein.`
            : 'Zyada bookings accept karein taake optimized route generate ho.'}
        </Text>
      </View>

      <View style={styles.routeStats}>
        <View style={styles.routeStatItem}>
          <Text style={styles.routeStatVal}>{stops.length}</Text>
          <Text style={styles.routeStatLabel}>Jobs</Text>
        </View>
        <View style={styles.routeStatItem}>
          <Text style={styles.routeStatVal}>—</Text>
          <Text style={styles.routeStatLabel}>Total</Text>
        </View>
        <View style={styles.routeStatItem}>
          <Text style={[styles.routeStatVal, { color: Colors.primary }]}>
            {formatWorkerPrice(expectedTotal)}
          </Text>
          <Text style={styles.routeStatLabel}>Expected</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  errorText: { color: Colors.danger, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  mapCard: {
    height: 180, borderRadius: Radius.xl, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
    overflow: 'hidden', position: 'relative',
  },
  mapGrid: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.surfaceElevated },
  dot: {
    position: 'absolute', width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.warning, justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.warning, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  dotNum: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '800' },
  routeLine: {
    position: 'absolute', left: '20%', top: '35%', width: '60%', height: 2,
    backgroundColor: Colors.warning + '66', transform: [{ rotate: '20deg' }],
  },
  mapLabel: { position: 'absolute', bottom: 10, right: 12, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  stopCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stopNumBox: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center',
  },
  stopNum: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.warning },
  stopTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  stopMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  bufferCard: { backgroundColor: Colors.inputBg, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  bufferText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },
  tipCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryDim, padding: Spacing.md, marginBottom: Spacing.md },
  tipTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  tipText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  routeStats: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  routeStatItem: { flex: 1, alignItems: 'center' },
  routeStatVal: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  routeStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
});
