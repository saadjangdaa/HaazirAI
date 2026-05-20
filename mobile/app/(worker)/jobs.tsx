import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch,
  ActivityIndicator, Alert, RefreshControl, StatusBar,
  Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useMockData } from '../../context/MockDataContext';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(300, SCREEN_W * 0.82);

type WorkerSidebarItem = { label: string; icon: string; path?: string; badge?: string; highlight?: boolean; dividerBefore?: boolean };
const WORKER_SIDEBAR_NAV: WorkerSidebarItem[] = [
  { label: 'My Jobs',       icon: 'briefcase-outline',     path: '/(worker)/jobs' },
  { label: 'Earnings',      icon: 'cash-outline',          path: '/(worker)/earnings' },
  { label: 'My Route',      icon: 'navigate-outline',      path: '/(worker)/route' },
  { label: 'Profile',       icon: 'person-outline',        path: '/(worker)/profile' },
  { label: 'Agent Traces',  icon: 'git-network-outline',   path: '/agent-traces', highlight: true, badge: 'NEW', dividerBefore: true },
  { label: 'Agent Logs',    icon: 'flask-outline',         path: '/logs' },
  { label: 'Nearby Workers',icon: 'people-outline',        path: '/nearby', dividerBefore: true },
];
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
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isMockMode, toggleMockMode } = useMockData();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);

  // ── Sidebar state ─────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const drawerTranslateX = drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [-SIDEBAR_W, 0] });
  const overlayOpacity   = drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.spring(drawerAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };
  const closeSidebar = () => {
    Animated.timing(drawerAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setSidebarOpen(false));
  };
  const handleSidebarNav = (path?: string) => {
    closeSidebar();
    if (path) setTimeout(() => router.push(path as any), 230);
  };
  const handleWorkerLogout = () => {
    closeSidebar();
    setTimeout(() => {
      Alert.alert('Logout', 'Kya aap logout karna chahte hain?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: async () => {
          try { await signOut(); } finally { router.replace('/login'); }
        }},
      ]);
    }, 250);
  };
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
        <TouchableOpacity style={styles.hamburgerBtn} onPress={openSidebar} activeOpacity={0.75}>
          <Ionicons name="menu" size={22} color={Colors.textInverse} />
        </TouchableOpacity>
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

      {/* ── Sidebar overlay ── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: overlayOpacity }]}
        pointerEvents={sidebarOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={closeSidebar} activeOpacity={1} />
      </Animated.View>

      {/* ── Sidebar drawer ── */}
      <Animated.View style={[wStyles.sidebar, { transform: [{ translateX: drawerTranslateX }], paddingTop: insets.top }]}>
        <TouchableOpacity style={wStyles.closeBtn} onPress={closeSidebar} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color="#666" />
        </TouchableOpacity>

        {/* Worker profile */}
        <View style={wStyles.profile}>
          <View style={wStyles.profileAvatar}>
            <Ionicons name="construct" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={wStyles.profileName} numberOfLines={1}>{isMockMode ? 'Mohammad Rashid' : displayName}</Text>
            <Text style={wStyles.profileSub} numberOfLines={1}>{isMockMode ? 'AC Repair, Electrician' : (user?.workerData?.specializations?.slice(0, 2).join(', ') || 'Haazir Worker')}</Text>
            <View style={[wStyles.onlineDot, { backgroundColor: online ? Colors.success : Colors.textMuted }]}>
              <Text style={wStyles.onlineDotText}>{online ? '● Online' : '● Offline'}</Text>
            </View>
          </View>
        </View>

        {/* Nav items */}
        <ScrollView style={wStyles.scroll} showsVerticalScrollIndicator={false}>
          {WORKER_SIDEBAR_NAV.map((item) => (
            <View key={item.label}>
              {item.dividerBefore && <View style={wStyles.divider} />}
              <TouchableOpacity style={wStyles.item} onPress={() => handleSidebarNav(item.path)} activeOpacity={0.75}>
                <View style={[wStyles.itemIcon, item.highlight && wStyles.itemIconHL]}>
                  <Ionicons name={item.icon as any} size={18} color={item.highlight ? Colors.primary : '#666'} />
                </View>
                <Text style={[wStyles.itemLabel, item.highlight && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                  {item.label}
                </Text>
                {item.badge && (
                  <View style={wStyles.badge}><Text style={wStyles.badgeText}>{item.badge}</Text></View>
                )}
                <Ionicons name="chevron-forward" size={15} color={Colors.border} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={wStyles.divider} />

          {/* Demo mode */}
          <View style={wStyles.toggleRow}>
            <View style={wStyles.itemIcon}>
              <Ionicons name="color-wand-outline" size={18} color="#666" />
            </View>
            <Text style={wStyles.itemLabel}>Demo Mode</Text>
            <Switch
              value={isMockMode}
              onValueChange={toggleMockMode}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={isMockMode ? '#fff' : Colors.textMuted}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>

          <View style={wStyles.divider} />

          {/* Logout */}
          <TouchableOpacity style={wStyles.item} onPress={handleWorkerLogout} activeOpacity={0.75}>
            <View style={[wStyles.itemIcon, { backgroundColor: Colors.dangerDim }]}>
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            </View>
            <Text style={[wStyles.itemLabel, { color: Colors.danger }]}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={[wStyles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={wStyles.footerText}>Haazir AI v1.0 · Google Hackathon</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const wStyles = StyleSheet.create({
  sidebar: {
    position: 'absolute', top: 0, left: 0, bottom: 0, width: SIDEBAR_W,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
    borderTopRightRadius: 24, borderBottomRightRadius: 24,
  },
  closeBtn: {
    position: 'absolute', top: 52, right: 14, zIndex: 1,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#F6F7FB', justifyContent: 'center', alignItems: 'center',
  },
  profile: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18,
    backgroundColor: Colors.primaryLight,
    borderBottomWidth: 1, borderBottomColor: Colors.primaryDim,
  },
  profileAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.workerAccent,
    justifyContent: 'center', alignItems: 'center',
  },
  profileName: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  profileSub: { fontSize: 12, color: '#999', marginBottom: 5 },
  onlineDot: {
    alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2,
  },
  onlineDotText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  scroll: { flex: 1 },
  divider: { height: 1, backgroundColor: '#EBEBEB', marginVertical: 4, marginHorizontal: 16 },

  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F6F7FB', justifyContent: 'center', alignItems: 'center' },
  itemIconHL: { backgroundColor: Colors.primaryLight },
  itemLabel: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },
  badge: { backgroundColor: Colors.primary, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4 },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },

  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EBEBEB', padding: 16, alignItems: 'center' },
  footerText: { fontSize: 11, color: '#999' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  hamburgerBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
