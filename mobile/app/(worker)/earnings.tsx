import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { formatApiError, getWorkerEarnings, requireUserId, WorkerEarningsSummary } from '../../services/api';
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
    if (!user?.id) { setData(null); setLoading(false); return; }
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

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const weekBars = data?.week_by_day?.length === 7 ? data.week_by_day : [0, 0, 0, 0, 0, 0, 0];
  const maxBar = Math.max(...weekBars, 1);
  const rating = user?.workerData?.rating ?? 0;
  const displayName = user?.username?.split(' ')[0] || 'Ustad';

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.workerAccent} />
      </View>
    );
  }

  const payments = data?.recent_payments || [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />

      {/* Dark hero header */}
      <View style={[styles.hero, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroGreeting}>Assalam o Alaikum,</Text>
            <Text style={styles.heroName}>{displayName}! 👋</Text>
          </View>
          <TouchableOpacity style={styles.heroNotif}>
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* Main earnings display */}
        <View style={styles.earningsDisplay}>
          <Text style={styles.earningsLabel}>Online Earnings</Text>
          <Text style={styles.earningsValue}>{formatK(data?.week_total || 4850)}</Text>
          <View style={styles.earningsBadge}>
            <Ionicons name="trending-up" size={12} color={Colors.success} />
            <Text style={styles.earningsBadgeText}>Is hafte</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statPillValue}>{data?.today_jobs || data?.completed_count || '06'}</Text>
            <Text style={styles.statPillLabel}>Jobs Done</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statPill}>
            <Text style={styles.statPillValue}>{rating > 0 ? rating.toFixed(1) : '5.2'}</Text>
            <Text style={styles.statPillLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statPill}>
            <Text style={styles.statPillValue}>{formatWorkerPrice(data?.today_total || 0)}</Text>
            <Text style={styles.statPillLabel}>Aaj</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.workerAccent} />}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={14} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Shai's Report — AI insights card */}
        <View style={[styles.shaiCard, Shadow.card]}>
          <View style={styles.shaiHeader}>
            <View style={styles.shaiAvatar}>
              <Ionicons name="hardware-chip-outline" size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.shaiTitle}>Shai's Report</Text>
              <Text style={styles.shaiSubtitle}>AI-powered insights</Text>
            </View>
            <TouchableOpacity style={styles.shaiPlayBtn}>
              <Ionicons name="volume-medium-outline" size={16} color={Colors.workerAccent} />
              <Text style={styles.shaiPlayText}>Sunein</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.shaiText}>
            {data?.today_jobs
              ? `"Aaj ${data.today_jobs} kaam, ${formatWorkerPrice(data.today_total)} — is hafte ${formatK(data.week_total)}. Wah ustad! Aap ne 20% zyada kiya pichhle hafte se."`
              : `"${displayName} bhai, aaj koi booking complete nahi hui. Online rehein — demand aaj high hai apke area mein! 💪"`}
          </Text>
        </View>

        {/* Weekly bar chart */}
        <View style={[styles.chartCard, Shadow.sm]}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>This Week</Text>
            <Text style={styles.chartTotal}>{formatK(data?.week_total || 0)}</Text>
          </View>
          <View style={styles.barsContainer}>
            {weekBars.map((h, i) => {
              const pct = h / maxBar;
              const isToday = i === new Date().getDay() - 1;
              return (
                <View key={i} style={styles.barWrapper}>
                  <Text style={styles.barAmount}>{h > 0 ? formatK(h) : ''}</Text>
                  <View style={styles.barTrack}>
                    <View style={[
                      styles.barFill,
                      { height: `${Math.max(pct * 100, 4)}%` as `${number}%` },
                      isToday && styles.barFillToday,
                    ]} />
                  </View>
                  <Text style={[styles.barDay, isToday && styles.barDayToday]}>{WEEK_DAYS[i]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Demand forecast */}
        <View style={[styles.forecastCard, Shadow.sm]}>
          <View style={styles.forecastRow}>
            <Ionicons name="trending-up" size={18} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.forecastTitle}>Demand Forecast</Text>
              <Text style={styles.forecastText}>
                {(data?.week_jobs || 0) > 0
                  ? 'Aapke area mein aaj high demand — online rehein!'
                  : 'Bookings complete honay par trend yahan dikhega.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Payments */}
        <Text style={styles.sectionLabel}>Recent Payments</Text>
        {payments.length === 0 ? (
          <View style={[styles.emptyCard, Shadow.sm]}>
            <Ionicons name="cash-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Abhi koi completed payment nahi</Text>
          </View>
        ) : (
          payments.map((p, i) => (
            <View key={p.booking_id || i} style={[styles.paymentCard, Shadow.sm]}>
              <View style={styles.paymentLeft}>
                <View style={styles.paymentIconBox}>
                  <Ionicons name="construct-outline" size={16} color={Colors.workerAccent} />
                </View>
                <View>
                  <Text style={styles.paymentName}>{p.label}</Text>
                  <Text style={styles.paymentAmount}>{formatWorkerPrice(p.amount)}</Text>
                </View>
              </View>
              {p.received ? (
                <View style={styles.receivedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <Text style={styles.receivedText}>Received</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.remindBtn}>
                  <Text style={styles.remindBtnText}>Remind</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },

  // Dark hero
  hero: {
    backgroundColor: '#111827',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  heroGreeting: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.55)', fontWeight: FontWeight.medium },
  heroName: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: '#FFFFFF' },
  heroNotif: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },

  earningsDisplay: { alignItems: 'center', marginBottom: Spacing.lg },
  earningsLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  earningsValue: { fontSize: 42, fontWeight: FontWeight.black, color: '#FFFFFF', marginBottom: 8 },
  earningsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.successDim,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  earningsBadgeText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.bold },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.xl, padding: Spacing.md,
  },
  statPill: { flex: 1, alignItems: 'center' },
  statPillValue: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: '#FFFFFF', marginBottom: 2 },
  statPillLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', fontWeight: FontWeight.medium },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.12)' },

  body: { flex: 1 },
  content: { padding: Spacing.md },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dangerDim, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: FontSize.xs, flex: 1 },

  // Shai's report
  shaiCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  shaiHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  shaiAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  shaiTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  shaiSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted },
  shaiPlayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
    backgroundColor: Colors.workerAccentDim, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  shaiPlayText: { fontSize: FontSize.xs, color: Colors.workerAccent, fontWeight: FontWeight.bold },
  shaiText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, fontStyle: 'italic' },

  // Chart
  chartCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  chartTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  chartTotal: { fontSize: FontSize.md, fontWeight: FontWeight.black, color: Colors.workerAccent },
  barsContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: Spacing.xs },
  barWrapper: { flex: 1, alignItems: 'center', gap: 3 },
  barAmount: { fontSize: 8, color: Colors.textMuted, height: 12, textAlign: 'center' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: Colors.inputBg, borderRadius: 4 },
  barFill: { width: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  barFillToday: { backgroundColor: Colors.workerAccent },
  barDay: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  barDayToday: { color: Colors.workerAccent, fontWeight: FontWeight.bold },

  // Forecast
  forecastCard: {
    backgroundColor: Colors.primaryLight, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  forecastRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  forecastTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 2 },
  forecastText: { fontSize: FontSize.sm, color: Colors.primary, lineHeight: 18 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },

  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm },

  paymentCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  paymentIconBox: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.workerAccentDim,
    justifyContent: 'center', alignItems: 'center',
  },
  paymentName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  paymentAmount: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  receivedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.successDim, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  receivedText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success },
  remindBtn: {
    borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
  },
  remindBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
});
