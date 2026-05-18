import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import {
  formatApiError,
  getWorkerBookings,
  requireUserId,
  updateBookingStatus,
  UserBooking,
} from '../../services/api';
import {
  formatWorkerPrice,
  formatWorkerTime,
  isActiveWorkerStatus,
  isOfferStatus,
  WORKER_STATUS_LABEL,
} from '../../utils/workerBookings';

export default function WorkerJobsScreen() {
  const { user } = useAuth();
  const [online, setOnline] = useState(true);
  const [bookings, setBookings] = useState<UserBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(59);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setBookings([]);
      setLoading(false);
      return;
    }
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
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const offer = useMemo(
    () => bookings.find((b) => isOfferStatus(b.status) && b.booking_id !== acceptedId),
    [bookings, acceptedId]
  );

  const activeJobs = useMemo(
    () =>
      bookings.filter(
        (b) =>
          isActiveWorkerStatus(b.status) &&
          b.booking_id !== offer?.booking_id &&
          (!isOfferStatus(b.status) || b.booking_id === acceptedId)
      ),
    [bookings, offer, acceptedId]
  );

  useEffect(() => {
    if (!offer || acceptedId) return;
    setCountdown(59);
    const t = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [offer?.booking_id, acceptedId]);

  const handleAccept = async () => {
    if (!offer?.booking_id) return;
    setBusy(true);
    try {
      await updateBookingStatus(offer.booking_id, 'confirmed');
      setAcceptedId(offer.booking_id);
      await load();
    } catch (e) {
      Alert.alert('Accept failed', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!offer?.booking_id) return;
    setBusy(true);
    try {
      await updateBookingStatus(offer.booking_id, 'cancelled');
      setCountdown(0);
      await load();
    } catch (e) {
      Alert.alert('Decline failed', formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const displayName = user?.username || user?.email?.split('@')[0] || 'Worker';
  const insets = useSafeAreaInsets();

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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarBox}><Text style={styles.avatarIcon}>🔧</Text></View>
          <View>
            <Text style={styles.headerName}>{displayName}</Text>
            <Text style={styles.headerSub}>
              {user?.workerData?.specializations?.join(', ') || 'Haazir Worker'}
            </Text>
          </View>
        </View>
        <View style={styles.onlineRow}>
          <Text style={[styles.onlineText, { color: online ? Colors.primary : Colors.textMuted }]}>
            {online ? 'Online' : 'Offline'}
          </Text>
          <Switch
            value={online}
            onValueChange={setOnline}
            trackColor={{ false: Colors.border, true: Colors.primaryDim }}
            thumbColor={online ? Colors.primary : Colors.textMuted}
          />
        </View>
      </View>

      {online ? (
        <Text style={styles.statusText}>Aap Online Hain ✅ — Naye kaam aa rahe hain</Text>
      ) : (
        <Text style={[styles.statusText, { color: Colors.textMuted }]}>Aap Offline Hain — Online hojayein kaam pane ke liye</Text>
      )}

      {online && offer && !acceptedId && countdown > 0 && (
        <View style={[styles.newJobCard, Shadow.card]}>
          <View style={styles.newJobHeader}>
            <View style={styles.newJobBadge}>
              <Text style={styles.newJobBadgeText}>🔔 Naya Kaam!</Text>
            </View>
            <Text style={styles.countdownText}>{countdown}s</Text>
          </View>
          <Text style={styles.newJobTitle}>{offer.service || 'Service'}</Text>
          <Text style={styles.newJobMeta}>{formatWorkerTime(offer)}</Text>
          <View style={styles.newJobPriceRow}>
            <Text style={styles.newJobPriceLabel}>Offered:</Text>
            <Text style={styles.newJobPrice}>{formatWorkerPrice(offer.price)}</Text>
          </View>
          <View style={styles.newJobBtns}>
            <TouchableOpacity
              style={[styles.acceptBtn, Shadow.primary]}
              onPress={handleAccept}
              disabled={busy}
            >
              <Text style={styles.acceptBtnText}>{busy ? '...' : '✅ Accept'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} disabled={busy}>
              <Text style={styles.declineBtnText}>❌ Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {acceptedId && (
        <View style={[styles.acceptedCard, Shadow.card]}>
          <Text style={styles.acceptedText}>✅ Kaam Accept Ho Gaya!</Text>
          <Text style={styles.acceptedMeta}>
            {bookings.find((b) => b.booking_id === acceptedId)?.service || 'Booking'} ·{' '}
            {formatWorkerTime(bookings.find((b) => b.booking_id === acceptedId) || {})}
          </Text>
        </View>
      )}

      {activeJobs.length > 1 && (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            ⚠️ Aapke paas {activeJobs.length} active bookings hain — schedule check karein
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Active Jobs</Text>
      {activeJobs.length === 0 ? (
        <Text style={styles.emptyText}>Koi active job nahi — naye offers yahan dikhenge</Text>
      ) : (
        activeJobs.map((job) => {
          const st = (job.status || 'pending').toLowerCase();
          const label = WORKER_STATUS_LABEL[st] || st;
          const enRoute = ['on_the_way', 'arrived', 'in_progress'].includes(st);
          return (
            <View key={job.booking_id} style={[styles.jobCard, Shadow.card]}>
              <View style={styles.jobRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobSvc}>{job.service || 'Service'}</Text>
                  <Text style={styles.jobMeta}>{formatWorkerTime(job)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={[styles.statusBadge, enRoute ? styles.statusGreen : styles.statusGray]}>
                    <Text style={[styles.statusBadgeText, { color: enRoute ? Colors.primary : Colors.textMuted }]}>
                      {label}
                    </Text>
                  </View>
                  <Text style={styles.jobPrice}>{formatWorkerPrice(job.price)}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatarBox: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center' },
  avatarIcon: { fontSize: 20 },
  headerName: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, maxWidth: 160 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  onlineText: { fontSize: FontSize.xs, fontWeight: '700' },
  statusText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.md },
  newJobCard: { backgroundColor: '#FFFBEB', borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning, padding: Spacing.md, marginBottom: Spacing.md },
  newJobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  newJobBadge: { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  newJobBadgeText: { color: Colors.background, fontSize: FontSize.xs, fontWeight: '800' },
  countdownText: { color: Colors.warning, fontSize: FontSize.md, fontWeight: '800', fontVariant: ['tabular-nums'] },
  newJobTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  newJobMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  newJobPriceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  newJobPriceLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  newJobPrice: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary },
  newJobBtns: { flexDirection: 'row', gap: Spacing.sm },
  acceptBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center' },
  acceptBtnText: { color: Colors.background, fontSize: FontSize.sm, fontWeight: '800' },
  declineBtn: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  declineBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },
  acceptedCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  acceptedText: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primary },
  acceptedMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  warningCard: { backgroundColor: '#FFFBEB', borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44' },
  warningText: { fontSize: FontSize.xs, color: Colors.warning },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  jobCard: { backgroundColor: Colors.cardBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  jobRow: { flexDirection: 'row', alignItems: 'center' },
  jobSvc: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  jobMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2, marginBottom: 4 },
  statusGreen: { backgroundColor: Colors.surfaceElevated },
  statusGray: { backgroundColor: Colors.border },
  statusBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  jobPrice: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
});
