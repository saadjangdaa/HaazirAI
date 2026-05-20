import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch,
  ActivityIndicator, Alert, RefreshControl, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useMockData } from '../../context/MockDataContext';
import { formatApiError, getWorkerBookings, requireUserId, updateBookingStatus, UserBooking } from '../../services/api';
import { formatWorkerPrice, formatWorkerTime, isActiveWorkerStatus, isOfferStatus, isTerminalStatus, WORKER_STATUS_LABEL } from '../../utils/workerBookings';
import { MOCK_WORKER_BOOKINGS } from '../../data/mockData';

const STATUS_NEXT: Record<string, { label: string; nextStatus: string; icon: string }> = {
  confirmed:   { label: 'Rawaana Ho Gaya',  nextStatus: 'on_the_way',  icon: 'car-outline' },
  on_the_way:  { label: 'Pahunch Gaya',      nextStatus: 'arrived',     icon: 'location-outline' },
  arrived:     { label: 'Kaam Shuru Karo',   nextStatus: 'in_progress', icon: 'play-circle-outline' },
  in_progress: { label: 'Kaam Mukammal',     nextStatus: 'completed',   icon: 'checkmark-circle-outline' },
};

export default function WorkerJobsScreen() {
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);
  const [bookings, setBookings] = useState<UserBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(59);
  const [busy, setBusy] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isMockMode) {
      setBookings([...MOCK_WORKER_BOOKINGS]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!user?.id) { setBookings([]); setLoading(false); return; }
    try {
      const uid = requireUserId(user);
      const res = await getWorkerBookings(uid);
      setBookings(res.bookings || []);
    } catch (e) {
      setBookings([]);
      Alert.alert('Jobs load nahi hue', formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, isMockMode]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const offer = useMemo(
    () => bookings.find((b) => isOfferStatus(b.status) && b.booking_id !== acceptedId),
    [bookings, acceptedId]
  );
  const activeJobs = useMemo(
    () => bookings.filter((b) => isActiveWorkerStatus(b.status) && b.booking_id !== offer?.booking_id && (!isOfferStatus(b.status) || b.booking_id === acceptedId)),
    [bookings, offer, acceptedId]
  );
  const completedJobs = useMemo(
    () => bookings.filter((b) => isTerminalStatus(b.status || '')),
    [bookings]
  );

  useEffect(() => {
    if (!offer || acceptedId) return;
    setCountdown(59);
    const t = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [offer?.booking_id, acceptedId]);

  const handleAccept = async () => {
    if (!offer?.booking_id) return;
    if (isMockMode) {
      setBookings(prev => prev.map(b =>
        b.booking_id === offer.booking_id ? { ...b, status: 'confirmed' } : b
      ));
      setAcceptedId(offer.booking_id);
      return;
    }
    setBusy(true);
    try { await updateBookingStatus(offer.booking_id, 'confirmed'); setAcceptedId(offer.booking_id); await load(); }
    catch (e) { Alert.alert('Accept failed', formatApiError(e)); }
    finally { setBusy(false); }
  };

  const handleDecline = async () => {
    if (!offer?.booking_id) return;
    if (isMockMode) {
      setBookings(prev => prev.filter(b => b.booking_id !== offer.booking_id));
      setCountdown(0);
      return;
    }
    setBusy(true);
    try { await updateBookingStatus(offer.booking_id, 'cancelled'); setCountdown(0); await load(); }
    catch (e) { Alert.alert('Decline failed', formatApiError(e)); }
    finally { setBusy(false); }
  };

  const handleStatusAdvance = async (booking: UserBooking) => {
    const st = (booking.status || '').toLowerCase();
    const next = STATUS_NEXT[st];
    if (!next || !booking.booking_id) return;
    if (isMockMode) {
      setBookings(prev => prev.map(b =>
        b.booking_id === booking.booking_id ? { ...b, status: next.nextStatus } : b
      ));
      return;
    }
    setAdvancingId(booking.booking_id);
    try {
      await updateBookingStatus(booking.booking_id, next.nextStatus);
      await load();
    } catch (e) {
      Alert.alert('Update failed', formatApiError(e));
    } finally {
      setAdvancingId(null);
    }
  };

  const displayName = isMockMode
    ? 'Mohammad Rashid'
    : (user?.username || user?.email?.split('@')[0] || 'Worker');

  if (loading && bookings.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarCircle}>
            <Ionicons name="construct" size={20} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.headerName}>{displayName}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {isMockMode ? 'AC Repair, Electrician' : (user?.workerData?.specializations?.slice(0, 2).join(', ') || 'Haazir Worker')}
            </Text>
          </View>
        </View>
        <View style={styles.onlineToggle}>
          {isMockMode && (
            <View style={styles.mockBadge}>
              <Text style={styles.mockBadgeText}>DEMO</Text>
            </View>
          )}
          <Text style={[styles.onlineLabel, { color: online ? Colors.success : Colors.textMuted }]}>
            {online ? 'Online' : 'Offline'}
          </Text>
          <Switch
            value={online}
            onValueChange={setOnline}
            trackColor={{ false: Colors.border, true: Colors.success + '66' }}
            thumbColor={online ? Colors.success : Colors.textMuted}
            style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
          />
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View style={[styles.statusBanner, online ? styles.statusBannerOnline : styles.statusBannerOffline]}>
          <Ionicons name={online ? 'radio-outline' : 'moon-outline'} size={16} color={online ? Colors.success : Colors.textMuted} />
          <Text style={[styles.statusBannerText, { color: online ? Colors.success : Colors.textMuted }]}>
            {online ? 'Aap Online Hain — Naye kaam aa rahe hain' : 'Aap Offline Hain — Online hojayein kaam pane ke liye'}
          </Text>
        </View>

        {/* New job offer card */}
        {online && offer && !acceptedId && countdown > 0 && (
          <View style={[styles.newJobCard, Shadow.card]}>
            <View style={styles.newJobHeader}>
              <View style={styles.newJobBadge}>
                <Ionicons name="notifications" size={12} color={Colors.textInverse} />
                <Text style={styles.newJobBadgeText}>Naya Kaam!</Text>
              </View>
              <View style={styles.countdownBadge}>
                <Text style={styles.countdownText}>{countdown}s</Text>
              </View>
            </View>

            <Text style={styles.newJobTitle}>{offer.service || 'Service'}</Text>
            <View style={styles.newJobMetaRow}>
              <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.newJobMeta}>{formatWorkerTime(offer)}</Text>
            </View>

            <View style={styles.newJobPriceRow}>
              <Text style={styles.newJobPriceLabel}>Offered Price</Text>
              <Text style={styles.newJobPrice}>{formatWorkerPrice(offer.price)}</Text>
            </View>

            <View style={styles.newJobBtns}>
              <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} disabled={busy} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color={Colors.danger} />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.acceptBtn, Shadow.primary]} onPress={handleAccept} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color={Colors.textInverse} size="small" /> : (
                  <>
                    <Ionicons name="checkmark" size={18} color={Colors.textInverse} />
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Accepted confirmation */}
        {acceptedId && (
          <View style={[styles.acceptedCard, Shadow.sm]}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <View>
              <Text style={styles.acceptedText}>Kaam Accept Ho Gaya!</Text>
              <Text style={styles.acceptedMeta}>
                {bookings.find((b) => b.booking_id === acceptedId)?.service || 'Booking'} · {formatWorkerTime((bookings.find((b) => b.booking_id === acceptedId) || {}) as UserBooking)}
              </Text>
            </View>
          </View>
        )}

        {/* Warning */}
        {activeJobs.length > 1 && (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={14} color={Colors.warning} />
            <Text style={styles.warningText}>Aapke paas {activeJobs.length} active bookings hain — schedule check karein</Text>
          </View>
        )}

        {/* Active jobs */}
        <Text style={styles.sectionLabel}>Active Jobs</Text>
        {activeJobs.length === 0 ? (
          <View style={[styles.emptyCard, Shadow.sm]}>
            <Ionicons name="briefcase-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Koi active job nahi</Text>
            <Text style={styles.emptyText}>Online rehein — naye offers yahan dikhenge</Text>
          </View>
        ) : (
          activeJobs.map((job) => {
            const st = (job.status || 'pending').toLowerCase();
            const label = WORKER_STATUS_LABEL[st] || st;
            const enRoute = ['on_the_way', 'arrived', 'in_progress'].includes(st);
            const nextStep = STATUS_NEXT[st];
            const isAdvancing = advancingId === job.booking_id;
            return (
              <View key={job.booking_id} style={[styles.jobCard, Shadow.sm]}>
                <View style={styles.jobRow}>
                  <View style={styles.jobIconBox}>
                    <Ionicons name="construct-outline" size={18} color={enRoute ? Colors.primary : Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobSvc}>{job.service || 'Service'}</Text>
                    <View style={styles.jobMetaRow}>
                      <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                      <Text style={styles.jobMeta}>{formatWorkerTime(job)}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.statusBadge, enRoute ? styles.statusGreen : styles.statusGray]}>
                      <Text style={[styles.statusBadgeText, { color: enRoute ? Colors.primary : Colors.textMuted }]}>{label}</Text>
                    </View>
                    <Text style={styles.jobPrice}>{formatWorkerPrice(job.price)}</Text>
                  </View>
                </View>
                {nextStep && (
                  <TouchableOpacity
                    style={styles.advanceBtn}
                    onPress={() => handleStatusAdvance(job)}
                    disabled={isAdvancing}
                    activeOpacity={0.8}
                  >
                    {isAdvancing ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <>
                        <Ionicons name={nextStep.icon as any} size={14} color={Colors.primary} />
                        <Text style={styles.advanceBtnText}>{nextStep.label}</Text>
                        <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* Previous / completed jobs */}
        {completedJobs.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>Purane Kaam</Text>
            {completedJobs.map((job) => {
              const st = (job.status || '').toLowerCase();
              const label = WORKER_STATUS_LABEL[st] || st;
              const isDone = st === 'completed';
              return (
                <View key={job.booking_id} style={[styles.jobCard, styles.jobCardDim, Shadow.sm]}>
                  <View style={styles.jobRow}>
                    <View style={[styles.jobIconBox, { backgroundColor: isDone ? Colors.successDim : Colors.inputBg }]}>
                      <Ionicons
                        name={isDone ? 'checkmark-circle-outline' : 'close-circle-outline'}
                        size={18}
                        color={isDone ? Colors.success : Colors.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.jobSvc, { color: Colors.textSecondary }]}>{job.service || 'Service'}</Text>
                      <View style={styles.jobMetaRow}>
                        <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                        <Text style={styles.jobMeta}>{formatWorkerTime(job)}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[styles.statusBadge, isDone ? styles.statusDone : styles.statusGray]}>
                        <Text style={[styles.statusBadgeText, { color: isDone ? Colors.success : Colors.textMuted }]}>{label}</Text>
                      </View>
                      <Text style={styles.jobPrice}>{formatWorkerPrice(job.price)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textInverse },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', maxWidth: 160 },
  onlineToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  mockBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  mockBadgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },

  body: { flex: 1 },
  content: { padding: Spacing.md },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.lg, padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statusBannerOnline: { backgroundColor: Colors.successDim },
  statusBannerOffline: { backgroundColor: Colors.inputBg },
  statusBannerText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, flex: 1 },

  newJobCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 2, borderColor: Colors.primary,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  newJobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  newJobBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  newJobBadgeText: { color: Colors.textInverse, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  countdownBadge: {
    backgroundColor: Colors.primaryDim, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  countdownText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.black },
  newJobTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 6 },
  newJobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.md },
  newJobMeta: { fontSize: FontSize.sm, color: Colors.textMuted },
  newJobPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  newJobPriceLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  newJobPrice: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.primary },
  newJobBtns: { flexDirection: 'row', gap: Spacing.sm },
  acceptBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.lg, height: 48,
  },
  acceptBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  declineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.dangerDim, borderRadius: Radius.lg, height: 48,
    borderWidth: 1, borderColor: Colors.danger,
  },
  declineBtnText: { color: Colors.danger, fontSize: FontSize.md, fontWeight: FontWeight.bold },

  acceptedCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.successDim, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.success,
  },
  acceptedText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success },
  acceptedMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  warningCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warningDim, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.warning,
  },
  warningText: { fontSize: FontSize.xs, color: Colors.warning, flex: 1 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },

  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  jobCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  jobCardDim: { opacity: 0.7 },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  jobIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.inputBg, justifyContent: 'center', alignItems: 'center' },
  jobSvc: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 2 },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  jobMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  statusGreen: { backgroundColor: Colors.primaryLight },
  statusGray: { backgroundColor: Colors.inputBg },
  statusDone: { backgroundColor: Colors.successDim },
  statusBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  jobPrice: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },

  advanceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  advanceBtnText: {
    flex: 1,
    fontSize: FontSize.sm, fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
});
