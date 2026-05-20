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
import { useMockData } from '../../context/MockDataContext';
import { formatApiError, getWorkerEarnings, requireUserId, WorkerEarningsSummary } from '../../services/api';
import { formatWorkerPrice } from '../../utils/workerBookings';
import { MOCK_WORKER_EARNINGS, MOCK_WORKER_NAME } from '../../data/mockData';

const WEEK_DAYS = ['Pir', 'Mangal', 'Budh', 'Juma', 'Jumerat', 'Hafta', 'Itwar'];
const WEEK_DAYS_SHORT = ['P', 'Ma', 'Bu', 'Ju', 'Jum', 'Ha', 'It'];
const BAR_HEIGHT = 80;

function formatK(amount: number): string {
  if (amount >= 1000) return `Rs ${(amount / 1000).toFixed(1)}k`;
  return formatWorkerPrice(amount);
}

// 0=Sun,1=Mon,…6=Sat → map to our M-S array (Mon=0)
function todayBarIndex(): number {
  const d = new Date().getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;  // Sun→6, Mon→0, …, Sat→5
}

function serviceIcon(label: string): 'snow-outline' | 'flash-outline' | 'water-outline' | 'book-outline' | 'construct-outline' {
  const l = label.toLowerCase();
  if (l.includes('ac') || l.includes('air')) return 'snow-outline';
  if (l.includes('electric') || l.includes('wiring')) return 'flash-outline';
  if (l.includes('plumb') || l.includes('pipe') || l.includes('water')) return 'water-outline';
  if (l.includes('tutor') || l.includes('math') || l.includes('teach')) return 'book-outline';
  return 'construct-outline';
}

export default function WorkerEarningsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const [data, setData] = useState<WorkerEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isMockMode) {
      setData(MOCK_WORKER_EARNINGS);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
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
  }, [user?.id, isMockMode]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const weekBars = data?.week_by_day?.length === 7 ? data.week_by_day : [0, 0, 0, 0, 0, 0, 0];
  const maxBar = Math.max(...weekBars, 1);
  const todayIdx = todayBarIndex();
  const rating = user?.workerData?.rating ?? (isMockMode ? 4.8 : 0);
  const rawSlug = user?.username?.split('_')[0] || 'Ustad';
  const displayName = isMockMode
    ? MOCK_WORKER_NAME.split(' ')[0]
    : rawSlug.charAt(0).toUpperCase() + rawSlug.slice(1);

  const todayTotal = data?.today_total ?? 0;
  const todayJobs = data?.today_jobs ?? 0;
  const weekTotal = data?.week_total ?? 0;
  const weekJobs = data?.week_jobs ?? 0;
  const completedCount = data?.completed_count ?? 0;
  const pendingCount = (data?.recent_payments ?? []).filter(p => !p.received).length;
  const payments = data?.recent_payments ?? [];

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Hero Header */}
      <View style={[styles.hero, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroGreeting}>Assalam o Alaikum,</Text>
            <Text style={styles.heroName}>{displayName}!</Text>
          </View>
          <View style={styles.headerRight}>
            {isMockMode && (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>DEMO</Text>
              </View>
            )}
            <TouchableOpacity style={styles.heroNotif}>
              <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Two-column earnings cards */}
        <View style={styles.earningsGrid}>
          <View style={styles.earningsCard}>
            <Text style={styles.earningsCardLabel}>Aaj ki Kamaai</Text>
            <Text style={styles.earningsCardValue}>{formatK(todayTotal)}</Text>
            <View style={styles.earningsCardFooter}>
              <Ionicons name="briefcase-outline" size={12} color="rgba(255,255,255,0.55)" />
              <Text style={styles.earningsCardSub}>{todayJobs} kaam</Text>
            </View>
          </View>
          <View style={[styles.earningsCard, styles.earningsCardAccent]}>
            <Text style={styles.earningsCardLabel}>Is Hafte</Text>
            <Text style={styles.earningsCardValue}>{formatK(weekTotal)}</Text>
            <View style={styles.earningsCardFooter}>
              <Ionicons name="briefcase-outline" size={12} color="rgba(255,255,255,0.55)" />
              <Text style={styles.earningsCardSub}>{weekJobs} kaam</Text>
            </View>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{completedCount}</Text>
            <Text style={styles.statLabel}>Total Kaam</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{rating > 0 ? rating.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, pendingCount > 0 && styles.statValueWarning]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={14} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Shai's AI Report */}
        <View style={[styles.shaiCard, Shadow.card]}>
          <View style={styles.shaiRow}>
            <View style={styles.shaiAvatar}>
              <Ionicons name="hardware-chip-outline" size={17} color={Colors.primary} />
            </View>
            <View style={styles.shaiBody}>
              <Text style={styles.shaiTitle}>Shai ka Report</Text>
              <Text style={styles.shaiText}>
                {todayJobs > 0
                  ? `Aaj ${todayJobs} kaam, ${formatWorkerPrice(todayTotal)} kamaai. Is hafte ${formatK(weekTotal)} ho gaya. Wah ustad!`
                  : `${displayName} bhai, aaj koi booking complete nahi hui. Online rehein — demand aaj high hai!`}
              </Text>
            </View>
            <TouchableOpacity style={styles.shaiPlayBtn}>
              <Ionicons name="volume-medium-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Weekly Bar Chart */}
        <View style={[styles.card, Shadow.sm]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Is Hafte ki Performance</Text>
            <Text style={styles.cardBadge}>{formatK(weekTotal)}</Text>
          </View>
          <View style={styles.chartArea}>
            {weekBars.map((val, i) => {
              const fillH = Math.max(Math.round((val / maxBar) * BAR_HEIGHT), val > 0 ? 6 : 2);
              const isToday = i === todayIdx;
              return (
                <View key={i} style={styles.barCol}>
                  {val > 0 && (
                    <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                      {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                    </Text>
                  )}
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: fillH },
                        isToday && styles.barFillToday,
                      ]}
                    />
                  </View>
                  <Text style={[styles.barDay, isToday && styles.barDayToday]}>
                    {WEEK_DAYS_SHORT[i]}
                  </Text>
                  {isToday && <View style={styles.todayDot} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* Recent Payments */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Payments</Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount} pending</Text>
            </View>
          )}
        </View>

        {payments.length === 0 ? (
          <View style={[styles.emptyCard, Shadow.sm]}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="cash-outline" size={28} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Abhi koi payment nahi</Text>
            <Text style={styles.emptySubtitle}>Kaam complete honay par yahan dikhega</Text>
          </View>
        ) : (
          payments.map((p, i) => (
            <View key={p.booking_id || i} style={[styles.paymentCard, Shadow.sm]}>
              <View style={[styles.paymentIcon, p.received ? styles.paymentIconGreen : styles.paymentIconBlue]}>
                <Ionicons name={serviceIcon(p.label)} size={16} color={p.received ? Colors.success : Colors.primary} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentLabel} numberOfLines={1}>{p.label}</Text>
                <Text style={styles.paymentAmount}>{formatWorkerPrice(p.amount)}</Text>
              </View>
              {p.received ? (
                <View style={styles.receivedBadge}>
                  <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                  <Text style={styles.receivedText}>Mila</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.remindBtn}>
                  <Text style={styles.remindBtnText}>Remind</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {/* Withdrawal CTA */}
        <TouchableOpacity style={[styles.withdrawBtn, Shadow.primary]}>
          <Ionicons name="arrow-down-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.withdrawText}>Paisay Nikaalna (Withdraw)</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },

  // Hero
  hero: {
    backgroundColor: '#0F172A',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  heroTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  heroGreeting: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.45)', fontWeight: FontWeight.medium },
  heroName: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: '#FFFFFF', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  demoBadge: {
    backgroundColor: Colors.workerAccentDim,
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.workerAccent,
  },
  demoBadgeText: { fontSize: 9, fontWeight: FontWeight.black, color: Colors.workerAccent, letterSpacing: 1 },
  heroNotif: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Earnings grid
  earningsGrid: { flexDirection: 'row', gap: Spacing.sm },
  earningsCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  earningsCardAccent: {
    backgroundColor: 'rgba(26,111,255,0.18)',
    borderColor: 'rgba(26,111,255,0.35)',
  },
  earningsCardLabel: {
    fontSize: FontSize.xs, color: 'rgba(255,255,255,0.50)',
    fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  earningsCardValue: {
    fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: '#FFFFFF', marginBottom: 6,
  },
  earningsCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  earningsCardSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.50)' },

  // Stats row
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.md, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statValue: { fontSize: FontSize.lg, fontWeight: FontWeight.black, color: '#FFFFFF', marginBottom: 2 },
  statValueWarning: { color: Colors.workerAccent },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.45)' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.10)' },

  body: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.sm },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dangerDim, borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1, borderColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: FontSize.xs, flex: 1 },

  // Shai card
  shaiCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primaryDim,
  },
  shaiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  shaiAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  shaiBody: { flex: 1 },
  shaiTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 3 },
  shaiText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  shaiPlayBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primaryDim,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },

  // Generic card
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  cardBadge: { fontSize: FontSize.md, fontWeight: FontWeight.black, color: Colors.primary },

  // Bar chart
  chartArea: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: BAR_HEIGHT + 40,
    gap: 6,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barLabel: { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, height: 12, textAlign: 'center' },
  barLabelToday: { color: Colors.primary },
  barTrack: {
    width: '100%', height: BAR_HEIGHT,
    justifyContent: 'flex-end',
    backgroundColor: Colors.inputBg,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: { width: '100%', backgroundColor: Colors.primary + '80', borderRadius: 6 },
  barFillToday: { backgroundColor: Colors.primary },
  barDay: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.medium },
  barDayToday: { color: Colors.primary, fontWeight: FontWeight.bold },
  todayDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  pendingBadge: {
    backgroundColor: Colors.warningDim, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.warning,
  },
  pendingBadgeText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.bold },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.inputBg,
    justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  // Payment cards
  paymentCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm,
  },
  paymentIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  paymentIconGreen: { backgroundColor: Colors.successDim },
  paymentIconBlue: { backgroundColor: Colors.primaryDim },
  paymentInfo: { flex: 1 },
  paymentLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginBottom: 2 },
  paymentAmount: { fontSize: FontSize.md, fontWeight: FontWeight.black, color: Colors.textPrimary },
  receivedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.successDim, borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  receivedText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success },
  remindBtn: {
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
  },
  remindBtnText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },

  // Withdraw
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  withdrawText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#FFFFFF' },
});
