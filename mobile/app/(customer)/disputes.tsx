import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomerSidebar from '../../components/CustomerSidebar';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  DisputeRecord,
  DisputeResolution,
  formatApiError,
  finalizeDispute,
  getUserBookings,
  getUserDisputes,
  isLoginRelatedError,
  resolveUserId,
  submitDispute,
  UserBooking,
} from '../../services/api';
import { useMockData } from '../../context/MockDataContext';
import { useLang } from '../../context/LanguageContext';
import { MOCK_CUSTOMER_BOOKINGS, MOCK_DISPUTES, MockDispute } from '../../data/mockData';
import { isDisputeAwaitingResolution } from '../../utils/disputeStatus';
import { isDisputeEligibleStatus } from '../../utils/disputeEligibility';

const DISPUTE_TYPES = [
  { id: 'noshow', label: 'Provider No-Show', icon: '😤' },
  { id: 'price', label: 'Price Disagreement', icon: '💰' },
  { id: 'quality', label: 'Quality Complaint', icon: '😞' },
  { id: 'incomplete', label: 'Job Not Completed', icon: '⏰' },
];

const TYPE_LABEL: Record<string, string> = {
  no_show: 'No-show',
  quality_complaint: 'Quality',
  price_disagreement: 'Price',
  rude_behavior: 'Behavior',
  overrun: 'Overrun',
  cancellation: 'Cancellation',
  refund_request: 'Refund',
  noshow: 'No-show',
  quality: 'Quality',
  price: 'Price',
  incomplete: 'Incomplete',
};

const AGENT_STEPS = [
  'Masla samjha gaya',
  'Worker ka jawab',
  'HIFAZAT + JHAGRA review',
];

function StatusBadge({ status }: { status: string }) {
  const key = (status || 'open').toLowerCase();
  const cfgMap: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: Colors.dangerDim, color: Colors.danger, label: 'Open' },
    under_review: { bg: Colors.surfaceElevated, color: Colors.warning, label: 'Review' },
    resolved: { bg: Colors.primaryDim, color: Colors.primary, label: 'Resolved' },
    escalated: { bg: Colors.dangerDim, color: Colors.danger, label: 'Escalated' },
    closed: { bg: Colors.border, color: Colors.textMuted, label: 'Closed' },
  };
  const cfg = cfgMap[key] || cfgMap.open;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity key={s} onPress={() => onChange(s)} activeOpacity={0.7}>
          <Ionicons
            name={s <= value ? 'star' : 'star-outline'}
            size={28}
            color={s <= value ? Colors.warning : Colors.border}
          />
        </TouchableOpacity>
      ))}
      {value > 0 && (
        <Text style={styles.ratingLabel}>
          {['', 'Bahut bura', 'Bura', 'Theek tha', 'Acha', 'Zabardast'][value]}
        </Text>
      )}
    </View>
  );
}

function pickBookingForDispute(
  bookings: { booking_id?: string; status?: string; created_at?: string }[],
  preferredBookingId?: string
) {
  if (preferredBookingId) {
    const match = bookings.find((b) => b.booking_id === preferredBookingId);
    if (match?.booking_id) return match;
  }
  const eligible = bookings.filter((b) => {
    const s = (b.status || '').toLowerCase();
    return b.booking_id && isDisputeEligibleStatus(s);
  });
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
}

export default function DisputesScreen() {
  const router = useRouter();
  const { bookingId: routeBookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const { user } = useAuth();
  const { isMockMode } = useMockData();
  const { tr } = useLang();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [sel, setSel] = useState('quality');
  const [rating, setRating] = useState(0);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // After-submit state
  const [agentActive, setAgentActive] = useState(false);
  const [resolution, setResolution] = useState<DisputeResolution | null>(null);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [doneSteps, setDoneSteps] = useState(0);

  // History
  const [disputes, setDisputes] = useState<MockDispute[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Pulse animation for agent shield
  const pulse = useRef(new Animated.Value(1)).current;

  const mapDisputeRow = (d: DisputeRecord, bookings: UserBooking[]): MockDispute => {
    const booking = bookings.find((b) => b.booking_id === d.booking_id);
    const st = (d.status || 'open').toLowerCase();
    return {
      id: d.dispute_id,
      bookingId: d.booking_id,
      service: booking?.service || 'Service',
      providerName: booking?.provider_name || 'Provider',
      type: d.type,
      typeLabel: TYPE_LABEL[d.type] || d.type,
      description: d.customer_message || d.description || '',
      status: (
        ['open', 'under_review', 'resolved', 'escalated', 'closed'].includes(st)
          ? st
          : 'open'
      ) as MockDispute['status'],
      resolution: d.resolution,
      refundAmount: d.refund_amount,
      createdAt: d.created_at || '',
    };
  };

  const loadHistory = useCallback(async () => {
    if (isMockMode) {
      setDisputes(MOCK_DISPUTES);
      return;
    }
    if (!user?.id) {
      setDisputes([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const uid = await resolveUserId(user);
      if (!uid) return;
      const [rows, bookings] = await Promise.all([
        getUserDisputes(uid),
        getUserBookings(uid),
      ]);
      setDisputes(rows.map((r) => mapDisputeRow(r, bookings)));
    } catch (e) {
      if (!isLoginRelatedError(formatApiError(e))) {
        Alert.alert('Disputes load nahi hue', formatApiError(e));
      }
      setDisputes([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id, isMockMode]);

  useFocusEffect(
    useCallback(() => {
      if (tab === 'history') loadHistory();
    }, [tab, loadHistory])
  );

  useEffect(() => {
    if (!agentActive) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 800, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 800, easing: Easing.ease, useNativeDriver: true }),
      ])
    ).start();
    // Reveal agent steps one by one
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      setDoneSteps(step);
      if (step >= AGENT_STEPS.length) clearInterval(id);
    }, 900);
    return () => { clearInterval(id); pulse.stopAnimation(); };
  }, [agentActive]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Tafseel likhein', 'Masle ki poori tafseel darj karein.');
      return;
    }
    setSubmitting(true);
    try {
      if (isMockMode) {
        await new Promise((r) => setTimeout(r, 900));
        setDisputeId('DSP-MOCK-' + Math.random().toString(36).slice(2, 6).toUpperCase());
        // Add to history immediately
        const newEntry: MockDispute = {
          id: 'DSP-MOCK-NEW',
          bookingId: 'HAZ-MOCK-003',
          service: 'Electrician',
          providerName: 'Rashid Hussain',
          type: sel,
          typeLabel: DISPUTE_TYPES.find((t) => t.id === sel)?.label || sel,
          description: description.trim(),
          status: 'open',
          createdAt: new Date().toISOString(),
        };
        setDisputes((prev) => [newEntry, ...prev]);
        setAgentActive(true);
        return;
      }

      const uid = await resolveUserId(user);
      if (!uid) {
        Alert.alert('Thori der intezar karein', 'Session load ho raha hai — dobara try karein.');
        return;
      }
      const bookings = await getUserBookings(uid);
      const preferredId = (routeBookingId || '').trim() || undefined;
      const target = pickBookingForDispute(bookings, preferredId);
      if (!target?.booking_id) {
        Alert.alert(
          'Pehle booking banayein',
          'Dispute file karne ke liye pehle Home se ek service book karein.',
          [{ text: 'Home Jao', onPress: () => router.push('/') }, { text: 'Theek Hai', style: 'cancel' }]
        );
        return;
      }
      const result = await submitDispute({
        bookingId: target.booking_id,
        userId: uid,
        disputeType: sel,
        description: description.trim(),
      });
      setDisputeId(result.dispute_id || null);
      setResolution(result);
      setAgentActive(true);
    } catch (err) {
      const msg = formatApiError(err);
      if (!isLoginRelatedError(msg)) Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = async (id: string) => {
    if (isMockMode) {
      setDisputes((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                status: 'resolved',
                resolution: 'Demo: JHAGRA ne faisla diya — provider ko warning.',
                refundAmount: 0,
              }
            : d
        )
      );
      return;
    }
    if (!user?.id) return;
    setFinalizingId(id);
    try {
      const uid = await resolveUserId(user);
      if (!uid) return;
      const result = await finalizeDispute({ disputeId: id, userId: uid });
      setResolution(result);
      setDisputeId(id);
      setAgentActive(true);
      await loadHistory();
    } catch (e) {
      Alert.alert('Error', formatApiError(e));
    } finally {
      setFinalizingId(null);
    }
  };

  const openCount = disputes.filter((d) => ['open', 'under_review'].includes(d.status)).length;

  // ── Agent Active Screen ───────────────────────────────────────────────
  if (agentActive) {
    return (
      <View style={styles.rootWrap}>
        <DisputeHeader insets={insets} onMenu={() => setSidebarOpen(true)} />
        <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.agentScreen}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <View style={styles.shieldCircle}>
              <Text style={styles.shieldIcon}>🛡️</Text>
            </View>
          </Animated.View>

          <Text style={styles.agentHeading}>
            {resolution && isDisputeAwaitingResolution(resolution)
              ? tr.submitDispute
              : tr.agentWorking}
          </Text>
          <Text style={styles.agentSub}>
            {resolution && isDisputeAwaitingResolution(resolution)
              ? 'Worker ko jawab dene ka moqa — phir review'
              : tr.disputeResolveSoon}
          </Text>

          {disputeId && (
            <View style={styles.disputeIdBox}>
              <Text style={styles.disputeIdLabel}>Dispute ID</Text>
              <Text style={styles.disputeIdVal}>{disputeId.slice(0, 12).toUpperCase()}</Text>
            </View>
          )}

          {/* Step progress */}
          <View style={styles.stepsCard}>
            {AGENT_STEPS.map((step, i) => {
              const done = i < doneSteps;
              const active = i === doneSteps;
              return (
                <View key={step} style={styles.stepRow}>
                  <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                    {done
                      ? <Ionicons name="checkmark" size={12} color={Colors.textInverse} />
                      : active
                      ? <ActivityIndicator size={10} color={Colors.textInverse} />
                      : null}
                  </View>
                  <Text style={[styles.stepText, done && styles.stepTextDone]}>{step}</Text>
                </View>
              );
            })}
          </View>

          {resolution && (
            <View style={styles.resolutionBox}>
              {isDisputeAwaitingResolution(resolution) ? (
                <>
                  <Text style={styles.resolutionHeading}>Agla Qadam</Text>
                  <Text style={styles.resolutionText}>
                    {resolution.message || resolution.case_summary}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.resolutionHeading}>JHAGRA ka Faisla</Text>
                  <Text style={styles.resolutionText}>{resolution.resolution}</Text>
                  {(resolution.refund_amount || 0) > 0 && (
                    <View style={styles.refundBadge}>
                      <Text style={styles.refundText}>
                        Refund: Rs {resolution.refund_amount?.toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {resolution.case_summary ? (
                    <Text style={styles.summaryText}>{resolution.case_summary}</Text>
                  ) : null}
                </>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => { setAgentActive(false); setTab('history'); }}
          >
            <Text style={styles.historyBtnText}>Purane Disputes Dekhein</Text>
          </TouchableOpacity>
          {disputeId && resolution && isDisputeAwaitingResolution(resolution) && (
            <TouchableOpacity
              style={[styles.finalizeBtn, { marginBottom: Spacing.sm }]}
              onPress={() => handleFinalize(disputeId)}
              disabled={!!finalizingId}
            >
              {finalizingId === disputeId
                ? <ActivityIndicator color={Colors.textInverse} size="small" />
                : <Text style={styles.finalizeBtnText}>JHAGRA Faisla Lein (jab worker jawab de)</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.newAgainBtn}
            onPress={() => {
              setSel('quality'); setRating(0); setDescription('');
              setAgentActive(false); setResolution(null); setDisputeId(null); setDoneSteps(0);
            }}
          >
            <Text style={styles.newAgainBtnText}>Naya Dispute Darj Karein</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
        <CustomerSidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </View>
    );
  }

  // ── Main Screen ───────────────────────────────────────────────────────
  return (
    <View style={styles.rootWrap}>
      <DisputeHeader insets={insets} onMenu={() => setSidebarOpen(true)} />
      <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>

      {isMockMode && (
        <View style={styles.mockBanner}>
          <Text style={styles.mockBannerText}>🎭 DEMO MODE — Booking: Electrician (HAZ-MOCK-003)</Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'new' && styles.tabActive]}
          onPress={() => setTab('new')}
        >
          <Text style={[styles.tabText, tab === 'new' && styles.tabTextActive]}>{tr.newDispute}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>
            {tr.disputeHistory}{openCount > 0 ? ` (${openCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── NEW DISPUTE TAB ── */}
      {tab === 'new' && (
        <>
          {!isMockMode && (
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
              <Text style={styles.infoText}>
                Dispute aapki latest booking ke against file hoga.
              </Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Masle ki qisam:</Text>
          <View style={styles.typeGrid}>
            {DISPUTE_TYPES.map((t) => {
              const on = sel === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeCard, on && styles.typeCardActive]}
                  onPress={() => setSel(t.id)}
                >
                  <Text style={styles.typeIcon}>{t.icon}</Text>
                  <Text style={[styles.typeLabel, on && styles.typeLabelActive]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Service ki Rating: <Text style={styles.optionalLabel}>(optional)</Text></Text>
          <StarRating value={rating} onChange={setRating} />

          <Text style={styles.sectionLabel}>Kya hua? Batayein:</Text>
          <View style={[styles.textAreaCard, Shadow.card]}>
            <TextInput
              style={styles.textArea}
              placeholder={
                isMockMode
                  ? 'Electrician ne kaam adhoora chor diya — wire connection nahi ki...'
                  : 'Masle ki poori tafseelaat likhein — kab, kya hua, provider ne kya kiya...'
              }
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            <View style={styles.charRow}>
              <TouchableOpacity style={styles.evidenceBtn}>
                <Ionicons name="camera-outline" size={15} color={Colors.textMuted} />
                <Text style={styles.evidenceBtnText}>Evidence Add Karein</Text>
              </TouchableOpacity>
              <Text style={styles.charCount}>{description.length}/500</Text>
            </View>
          </View>

          <View style={[styles.aiCard, Shadow.sm]}>
            <Text style={styles.aiTitle}>✨ Hifazat Dispute Agent active hai</Text>
            <Text style={styles.aiText}>
              {isMockMode
                ? 'Provider Rashid Hussain: 1 complaint in 60 days — re-service eligible'
                : 'Aapka dispute submit hone par provider ki history check ki jaegi.'}
            </Text>
          </View>

          {submitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.danger} />
              <Text style={styles.loadingText}>Hifazat Agent masla dekh raha hai...</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.submitBtn, Shadow.primary]} onPress={handleSubmit} activeOpacity={0.85}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textInverse} />
              <Text style={styles.submitBtnText}>{tr.submitDispute}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <>
          {historyLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.loadingText}>Disputes load ho rahe hain...</Text>
            </View>
          )}
          {!historyLoading && disputes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>{tr.noDisputes}</Text>
              <Text style={styles.emptyText}>{tr.noDisputesSub}</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setTab('new')}>
                <Text style={styles.emptyBtnText}>Naya Dispute Darj Karein</Text>
              </TouchableOpacity>
            </View>
          ) : (
            disputes.map((d) => {
              const expanded = expandedId === d.id;
              return (
                <View key={d.id} style={[styles.disputeCard, Shadow.card]}>
                  <TouchableOpacity onPress={() => setExpandedId(expanded ? null : d.id)} activeOpacity={0.8}>
                    <View style={styles.disputeHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.disputeService}>{d.service}</Text>
                        <Text style={styles.disputeMeta}>
                          {d.providerName} · {d.typeLabel}
                        </Text>
                        <Text style={styles.disputeDate}>
                          {new Date(d.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <View style={styles.disputeRight}>
                        <StatusBadge status={d.status} />
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={Colors.textMuted}
                          style={{ marginTop: 6 }}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>

                  {expanded && (
                    <View style={styles.disputeBody}>
                      <Text style={styles.disputeDescLabel}>Aapki Shikayat:</Text>
                      <Text style={styles.disputeDesc}>{d.description}</Text>

                      {(d.status === 'resolved' || d.status === 'escalated') && d.resolution && (
                        <View style={styles.resolvedBox}>
                          <Text style={styles.resolvedLabel}>✅ JHAGRA ka Faisla:</Text>
                          <Text style={styles.resolvedText}>{d.resolution}</Text>
                          {(d.refundAmount || 0) > 0 && (
                            <Text style={styles.resolvedRefund}>Refund: Rs {d.refundAmount?.toLocaleString()}</Text>
                          )}
                        </View>
                      )}

                      <Text style={styles.disputeIdSmall}>ID: {d.id}</Text>

                      {d.status === 'under_review' && (
                        <TouchableOpacity
                          style={styles.finalizeBtn}
                          onPress={() => handleFinalize(d.id)}
                          disabled={finalizingId === d.id}
                        >
                          {finalizingId === d.id
                            ? <ActivityIndicator size="small" color={Colors.textInverse} />
                            : <Text style={styles.finalizeBtnText}>JHAGRA Faisla Lein</Text>}
                        </TouchableOpacity>
                      )}

                      {d.status === 'open' && (
                        <Text style={styles.waitWorkerText}>
                          Worker ka jawab pending — phir &quot;JHAGRA Faisla&quot; available hoga.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </>
      )}
      </ScrollView>
      <CustomerSidebar visible={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </View>
  );
}

function DisputeHeader({ insets, onMenu }: { insets: { top: number }; onMenu: () => void }) {
  const { tr } = useLang();
  return (
    <View style={[disputeHeaderStyle.header, { paddingTop: insets.top + 6 }]}>
      <TouchableOpacity style={disputeHeaderStyle.menuBtn} onPress={onMenu}>
        <Ionicons name="menu" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={disputeHeaderStyle.title}>{tr.pageDispute}</Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

const disputeHeaderStyle = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  title: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  menuBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
});

const styles = StyleSheet.create({
  rootWrap: { flex: 1, backgroundColor: Colors.background },
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 48 },

  mockBanner: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    padding: Spacing.sm, alignItems: 'center', marginBottom: Spacing.md,
  },
  mockBannerText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },

  pageTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.inputBg,
    borderRadius: Radius.lg, padding: 4, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.md },
  tabActive: { backgroundColor: Colors.surface, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted },
  tabTextActive: { color: Colors.danger, fontWeight: FontWeight.bold },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warningDim, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.warning,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  infoText: { color: Colors.warning, fontSize: FontSize.xs, flex: 1, lineHeight: 18 },

  sectionLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  optionalLabel: { fontWeight: '400', color: Colors.textMuted },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  typeCard: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md,
  },
  typeCardActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerDim },
  typeIcon: { fontSize: 24, marginBottom: 6 },
  typeLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  typeLabelActive: { color: Colors.danger, fontWeight: '700' },

  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  ratingLabel: { fontSize: FontSize.sm, color: Colors.warning, fontWeight: '700', marginLeft: 4 },

  textAreaCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  textArea: { color: Colors.textPrimary, fontSize: FontSize.md, minHeight: 100, lineHeight: 22 },
  charRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  evidenceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  evidenceBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
  charCount: { fontSize: FontSize.xs, color: Colors.textMuted },

  aiCard: {
    backgroundColor: Colors.dangerDim, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.danger + '33',
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  aiTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.danger, marginBottom: 4 },
  aiText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md },
  loadingText: { color: Colors.danger, fontSize: FontSize.sm },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.danger, borderRadius: Radius.lg, height: 54,
  },
  submitBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '800' },

  // ── Agent Active Screen ──
  agentScreen: { alignItems: 'center', paddingTop: Spacing.xl },
  shieldCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.primaryDim, justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  shieldIcon: { fontSize: 52 },
  agentHeading: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primary, textAlign: 'center', marginBottom: 6 },
  agentSub: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },
  disputeIdBox: {
    backgroundColor: Colors.inputBg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginBottom: Spacing.lg, alignItems: 'center',
  },
  disputeIdLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  disputeIdVal: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 1.5 },
  stepsCard: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.lg,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center',
  },
  stepDotDone: { backgroundColor: Colors.primary },
  stepDotActive: { backgroundColor: Colors.warning },
  stepText: { fontSize: FontSize.sm, color: Colors.textMuted, flex: 1 },
  stepTextDone: { color: Colors.textPrimary, fontWeight: '600' },
  resolutionBox: {
    width: '100%', backgroundColor: Colors.primaryDim, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.primary, padding: Spacing.md, marginBottom: Spacing.lg,
  },
  resolutionHeading: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primary, marginBottom: 8 },
  resolutionText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 22 },
  refundBadge: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 4, alignSelf: 'flex-start', marginTop: Spacing.sm,
  },
  refundText: { color: Colors.textInverse, fontWeight: '800', fontSize: FontSize.sm },
  summaryText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.sm, lineHeight: 18 },
  historyBtn: {
    width: '100%', backgroundColor: Colors.primary, borderRadius: Radius.lg,
    height: 50, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm,
  },
  historyBtnText: { color: Colors.textInverse, fontWeight: '800', fontSize: FontSize.md },
  newAgainBtn: {
    width: '100%', borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border,
    height: 50, justifyContent: 'center', alignItems: 'center',
  },
  newAgainBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: FontSize.md },

  // ── History ──
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },
  emptyBtn: { backgroundColor: Colors.danger, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: 12 },
  emptyBtnText: { color: Colors.textInverse, fontWeight: '800', fontSize: FontSize.sm },

  disputeCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, overflow: 'hidden',
  },
  disputeHeader: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm },
  disputeRight: { alignItems: 'flex-end' },
  disputeService: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  disputeMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  disputeDate: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  badge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },

  disputeBody: {
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm,
  },
  disputeDescLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  disputeDesc: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20, marginBottom: Spacing.sm },
  resolvedBox: {
    backgroundColor: Colors.primaryDim, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.primary, padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  resolvedLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  resolvedText: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  resolvedRefund: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.primary, marginTop: 4 },
  disputeIdSmall: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  finalizeBtn: {
    borderRadius: Radius.md, backgroundColor: Colors.primary,
    paddingVertical: 10, alignItems: 'center',
  },
  finalizeBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.sm },
  waitWorkerText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm, fontStyle: 'italic' },
});
