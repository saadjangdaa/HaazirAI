import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import {
  formatApiError,
  getWorkerEarnings,
  requireUserId,
  WorkerEarningsSummary,
} from '../../services/api';
import { formatWorkerPrice } from '../../utils/workerBookings';

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function formatK(amount: number): string {
  if (amount >= 1000) return `Rs ${(amount / 1000).toFixed(1)}k`;
  return formatWorkerPrice(amount);
}

export default function WorkerEarningsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<WorkerEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const uid = requireUserId(user);
      const summary = await getWorkerEarnings(uid);
      setData(summary);
    } catch (e) {
      setError(formatApiError(e));
      setData(null);
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

  const weekBars = data?.week_by_day?.length === 7 ? data.week_by_day : [0, 0, 0, 0, 0, 0, 0];
  const maxBar = Math.max(...weekBars, 1);
  const rating = user?.workerData?.rating ?? 0;

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const payments = data?.recent_payments || [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
      }
    >
      <Text style={styles.title}>Meri Kamai 💰</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.statsRow}>
        <View style={[styles.statCard, Shadow.card]}>
          <Text style={styles.statLabel}>Aaj</Text>
          <Text style={[styles.statValue, { color: Colors.warning }]}>
            {formatWorkerPrice(data?.today_total || 0)}
          </Text>
          <Text style={styles.statSub}>{data?.today_jobs || 0} kaam</Text>
        </View>
        <View style={[styles.statCard, Shadow.card]}>
          <Text style={styles.statLabel}>Rating</Text>
          <Text style={styles.statValue}>⭐ {rating > 0 ? rating.toFixed(1) : '—'}</Text>
          <Text style={styles.statSub}>{data?.completed_count || 0} completed</Text>
        </View>
        <View style={[styles.statCard, Shadow.card]}>
          <Text style={styles.statLabel}>Is Hafte</Text>
          <Text style={[styles.statValue, { color: Colors.primary }]}>
            {formatK(data?.week_total || 0)}
          </Text>
          <Text style={styles.statSub}>{data?.week_jobs || 0} kaam</Text>
        </View>
      </View>

      <View style={[styles.aiCard, Shadow.card]}>
        <View style={styles.aiHeader}>
          <Text style={styles.aiIcon}>✨</Text>
          <Text style={styles.aiTitle}>AI Voice Report</Text>
        </View>
        <Text style={styles.aiText}>
          {data?.today_jobs
            ? `"Aaj ${data.today_jobs} kaam, ${formatWorkerPrice(data.today_total)} — is hafte ${formatK(data.week_total)}. Wah ustad! 🎉"`
            : '"Abhi completed bookings se earnings yahan dikhengi."'}
        </Text>
        <TouchableOpacity style={styles.playBtn}>
          <Text style={styles.playBtnText}>▶ Sunein</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.chartCard, Shadow.card]}>
        <Text style={styles.chartTitle}>This Week</Text>
        <View style={styles.barsContainer}>
          {weekBars.map((h, i) => (
            <View key={i} style={styles.barWrapper}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${(h / maxBar) * 100}%` as `${number}%` }]} />
              </View>
              <Text style={styles.barDay}>{WEEK_DAYS[i]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.forecastCard, Shadow.card]}>
        <Text style={styles.forecastTitle}>📈 Demand Forecast</Text>
        <Text style={styles.forecastText}>
          {(data?.week_jobs || 0) > 0
            ? 'Completed bookings se weekly trend upar chart mein hai.'
            : 'Kal bookings complete honay par trend yahan dikhega.'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Payments</Text>
      {payments.length === 0 ? (
        <Text style={styles.emptyText}>Abhi koi completed payment nahi</Text>
      ) : (
        payments.map((p, i) => (
          <View key={p.booking_id || i} style={[styles.paymentCard, Shadow.card]}>
            <View style={styles.paymentRow}>
              <View>
                <Text style={styles.paymentName}>{p.label}</Text>
                <Text style={styles.paymentAmount}>{formatWorkerPrice(p.amount)}</Text>
              </View>
              {p.received ? (
                <View style={styles.receivedBadge}>
                  <Text style={styles.receivedText}>Received ✅</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.remindBtn}>
                  <Text style={styles.remindBtnText}>Remind</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  errorText: { color: Colors.danger, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  statSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  aiCard: { backgroundColor: '#FFFBEB', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.warning + '55', padding: Spacing.md, marginBottom: Spacing.md },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  aiIcon: { fontSize: 16 },
  aiTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.warning },
  aiText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: Spacing.sm },
  playBtn: { backgroundColor: Colors.warning, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, alignSelf: 'flex-start' },
  playBtnText: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '700' },
  chartCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  chartTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  barsContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: Spacing.xs },
  barWrapper: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  barDay: { fontSize: FontSize.xs, color: Colors.textMuted },
  forecastCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primaryDim, padding: Spacing.md, marginBottom: Spacing.md },
  forecastTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  forecastText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  paymentCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  paymentAmount: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  receivedBadge: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  receivedText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  remindBtn: { borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  remindBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
});
